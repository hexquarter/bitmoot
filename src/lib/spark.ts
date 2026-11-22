import type { BreezSdk, OnchainConfirmationSpeed } from "@breeztech/breez-sdk-spark/web";
import { isOrgAdmin } from "./org";
import { getSettings } from "./settings";

/**
 * Org wallet service backed by Breez SDK Nodeless (Spark + Lightning).
 *
 * Every council member initializes the same wallet from the org seed they
 * decrypt from their NIP-44 wallet share. The storage directory is derived
 * from that seed, so members and orgs never mix local wallet state.
 */

/** USDB token identifier on Spark mainnet (6 decimals). */
export const USDB_TOKEN_ID = "btkn1xgrvjwey5ngcagvap2dzzvsy4uk8ua9x69k82dwvt5e7ef9drm9qztux87";
export const USDB_DECIMALS = 6;

/** All members must use this account number for the org wallet. */
export function orgAccountNumber(network: "MAINNET" | "REGTEST"): number {
  return network === "MAINNET" ? 1 : 0;
}

type BreezModule = typeof import("@breeztech/breez-sdk-spark/web");

let breezPromise: Promise<BreezModule> | null = null;
let cachedWallet: BreezSdk | null = null;
let cachedKey = "";

/** Load the WASM SDK only when the treasury is opened, not on app startup. */
function loadBreez(): Promise<BreezModule> {
  if (!breezPromise) {
    breezPromise = import("@breeztech/breez-sdk-spark/web").then(async (breez) => {
      await breez.default();
      return breez;
    });
  }
  return breezPromise;
}

export function getOrgWallet(): BreezSdk | null {
  return cachedWallet;
}

/** Wallet writes are admin-only even if a member somehow holds the seed. */
function requireWalletAdmin(): void {
  if (!isOrgAdmin()) {
    throw new Error("Only organization administrators can manage the org wallet");
  }
}

export async function disconnectOrgWallet(): Promise<void> {
  const wallet = cachedWallet;
  cachedWallet = null;
  cachedKey = "";
  if (wallet) {
    try {
      await wallet.disconnect();
    } catch {
      // Ignore shutdown errors; the local cache is already cleared.
    }
  }
}

/**
 * Connect (or return the cached) Breez wallet for the current org. The wallet
 * is derived from its own seed — deliberately separate from the org identity
 * seed — so it can be rotated without touching the org's npub or history.
 */
export async function connectOrgWallet(orgPubkey: string, walletSeed: string): Promise<BreezSdk> {
  const { network } = getSettings();
  const breezApiKey = import.meta.env.VITE_BREEZ_API_KEY?.trim();
  const key = `${network}:${orgPubkey}:${walletSeed}`;
  if (cachedWallet && cachedKey === key) return cachedWallet;

  const breez = await loadBreez();
  const config = breez.defaultConfig(network === "MAINNET" ? "mainnet" : "regtest");
  if (breezApiKey) config.apiKey = breezApiKey;

  const builder = breez.SdkBuilder.new(config, { type: "mnemonic", mnemonic: walletSeed }).withAccountNumber(
    orgAccountNumber(network),
  );
  const withStorage = await builder.withDefaultStorage(`bitmoot-${orgPubkey.slice(0, 16)}`);
  cachedWallet = await withStorage.build();
  cachedKey = key;
  return cachedWallet;
}

export interface OrgBalances {
  sats: bigint;
  satsOwned: bigint;
  satsIncoming: bigint;
  usdb: bigint;
}

export async function getOrgBalances(wallet: BreezSdk): Promise<OrgBalances> {
  const info = await wallet.getInfo({});
  const sats = BigInt(info.balanceSats);
  const usdb = info.tokenBalances.get(USDB_TOKEN_ID)?.balance ?? 0n;
  return { sats, satsOwned: sats, satsIncoming: 0n, usdb };
}

export async function getOrgSparkAddress(wallet: BreezSdk): Promise<string> {
  const res = await wallet.receivePayment({ paymentMethod: { type: "sparkAddress" } });
  return res.paymentRequest;
}

export async function getOrgStaticDepositAddress(wallet: BreezSdk): Promise<string> {
  const res = await wallet.receivePayment({
    paymentMethod: { type: "bitcoinAddress", newAddress: false },
  });
  return res.paymentRequest;
}

export interface OrgLightningAddress {
  address: string;
  username: string;
}

/** The org wallet's Lightning address (LUD-16, interoperable with any wallet), if registered. */
export async function getOrgLightningAddress(wallet: BreezSdk): Promise<OrgLightningAddress | null> {
  const info = await wallet.getLightningAddress();
  if (!info) return null;
  return { address: info.lightningAddress, username: info.username };
}

/** Suggest a username for the org's Lightning address from the org name. */
export function suggestLightningUsername(orgName: string): string {
  const slug = orgName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return slug || "treasury";
}

/** Register a Lightning address for the org wallet. Admin-only. */
export async function registerOrgLightningAddress(
  wallet: BreezSdk,
  username: string,
): Promise<OrgLightningAddress> {
  requireWalletAdmin();
  const clean = username.toLowerCase().replace(/[^a-z0-9-]+/g, "").slice(0, 32);
  if (!clean) throw new Error("Choose a username for the lightning address");
  const info = await wallet.registerLightningAddress({
    username: clean,
    description: "BitMoot treasury",
  });
  return { address: info.lightningAddress, username: info.username };
}

export async function createOrgLightningInvoice(
  wallet: BreezSdk,
  amountSats: number,
  memo?: string,
): Promise<{ invoice: string; id: string; expiresAt?: string }> {
  requireWalletAdmin();
  const res = await wallet.receivePayment({
    paymentMethod: {
      type: "bolt11Invoice",
      description: memo?.trim() || "BitMoot treasury",
      amountSats: Math.max(1, Math.round(amountSats)),
    },
  });
  return { invoice: res.paymentRequest, id: "", expiresAt: undefined };
}

export interface LightningPaymentResult {
  id: string;
  /** Best-effort resolved amount, used to compute the platform fee. */
  amountSats: number | null;
}

export async function payOrgLightningInvoice(
  wallet: BreezSdk,
  invoice: string,
  maxFeeSats?: number,
  amountSats?: number,
): Promise<LightningPaymentResult> {
  requireWalletAdmin();
  const prepared = await wallet.prepareSendPayment({
    paymentRequest: { type: "input", input: invoice.trim() },
    // Amountless BOLT-11 invoices need the amount approved in the proposal.
    ...(amountSats != null && amountSats > 0
      ? { amount: BigInt(Math.round(amountSats)) }
      : {}),
  });
  if (maxFeeSats !== undefined && prepared.paymentMethod.type === "bolt11Invoice") {
    const method = prepared.paymentMethod;
    const feeSats = method.lightningFeeSats + (method.sparkTransferFeeSats ?? 0);
    if (feeSats > maxFeeSats) throw new Error(`Estimated fee (${feeSats} sats) is above your limit`);
  }
  const result = await wallet.sendPayment({
    prepareResponse: prepared,
    options: { type: "bolt11Invoice", preferSpark: true },
  });

  let resolvedAmount: number | null = null;
  if (
    prepared.paymentMethod.type === "bolt11Invoice" &&
    prepared.paymentMethod.invoiceDetails.amountMsat != null
  ) {
    resolvedAmount = Math.round(prepared.paymentMethod.invoiceDetails.amountMsat / 1000);
  } else if (prepared.amount != null) {
    resolvedAmount = Number(prepared.amount);
  }
  return { id: result.payment.id, amountSats: resolvedAmount };
}

export async function sendUsdb(
  wallet: BreezSdk,
  receiverSparkAddress: string,
  amount: number,
): Promise<string> {
  requireWalletAdmin();
  const tokenAmount = BigInt(Math.round(amount * 10 ** USDB_DECIMALS));
  const prepared = await wallet.prepareSendPayment({
    paymentRequest: { type: "input", input: receiverSparkAddress.trim() },
    tokenIdentifier: USDB_TOKEN_ID,
    amount: tokenAmount,
  });
  const result = await wallet.sendPayment({
    prepareResponse: prepared,
    options: { type: "sparkAddress" },
  });
  return result.payment.id;
}

/** Send sats to another Spark wallet (used by treasury rotation). */
export async function sendSatsToSparkAddress(
  wallet: BreezSdk,
  receiverSparkAddress: string,
  amountSats: number,
): Promise<string> {
  requireWalletAdmin();
  const prepared = await wallet.prepareSendPayment({
    paymentRequest: { type: "input", input: receiverSparkAddress.trim() },
    amount: BigInt(Math.round(amountSats)),
  });
  const result = await wallet.sendPayment({
    prepareResponse: prepared,
    options: { type: "sparkAddress" },
  });
  return result.payment.id;
}

export async function withdrawOnchain(
  wallet: BreezSdk,
  onchainAddress: string,
  amountSats: number,
  speed: OnchainConfirmationSpeed = "fast",
): Promise<string> {
  requireWalletAdmin();
  const prepared = await wallet.prepareSendPayment({
    paymentRequest: { type: "input", input: onchainAddress.trim() },
    amount: BigInt(Math.round(amountSats)),
  });
  const result = await wallet.sendPayment({
    prepareResponse: prepared,
    options: { type: "bitcoinAddress", confirmationSpeed: speed },
  });
  return result.payment.id;
}

/** UI-neutral transfer shape so pages don't depend on SDK types. */
export interface OrgTransfer {
  id: string;
  type: string;
  status: string;
  amount: bigint;
  direction: "INCOMING" | "OUTGOING";
  createdAt: number;
}

export async function getOrgTransfers(wallet: BreezSdk, limit = 25): Promise<OrgTransfer[]> {
  const res = await wallet.listPayments({ limit, sortAscending: false });
  return res.payments.map((payment) => ({
    id: payment.id,
    type: payment.method,
    status: payment.status,
    amount: payment.amount,
    direction: payment.paymentType === "receive" ? "INCOMING" : "OUTGOING",
    createdAt: payment.timestamp,
  }));
}

/** Format a USDB bigint amount for display (6 decimals). */
export function formatUsdb(amount: bigint): string {
  const units = 10 ** USDB_DECIMALS;
  const whole = amount / BigInt(units);
  const frac = (amount % BigInt(units)).toString().padStart(USDB_DECIMALS, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}
