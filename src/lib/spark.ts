import { SparkWallet } from "@buildonspark/spark-sdk";
import type { ExitSpeed, WalletTransfer } from "@buildonspark/spark-sdk/types";
import { getSettings } from "./settings";

/**
 * Spark org wallet service.
 *
 * The org wallet is org-scoped (not per-user): every council member initializes
 * the same wallet from the shared org seed, which they decrypt from their
 * NIP-44-encrypted wallet share event. The account number must be identical
 * across members or they would derive different wallets — it is defined here
 * in exactly one place.
 */

/** USDB token identifier on Spark mainnet (6 decimals). */
export const USDB_TOKEN_ID = "btkn1xgrvjwey5ngcagvap2dzzvsy4uk8ua9x69k82dwvt5e7ef9drm9qztux87";
export const USDB_DECIMALS = 6;

/** All members must use this account number for the org wallet. */
export function orgAccountNumber(network: "MAINNET" | "REGTEST"): number {
  // Matches SDK defaults per network.
  return network === "MAINNET" ? 1 : 0;
}

let cachedWallet: SparkWallet | null = null;
let cachedKey = "";

export function getOrgWallet(): SparkWallet | null {
  return cachedWallet;
}

export function disconnectOrgWallet() {
  cachedWallet = null;
  cachedKey = "";
}

/** Connect (or return the cached) org wallet for the current network. */
export async function connectOrgWallet(mnemonic: string): Promise<SparkWallet> {
  const { network } = getSettings();
  const key = `${network}:${mnemonic}`;
  if (cachedWallet && cachedKey === key) return cachedWallet;
  const { wallet } = await SparkWallet.initialize({
    mnemonicOrSeed: mnemonic,
    accountNumber: orgAccountNumber(network),
    options: { network },
  });
  cachedWallet = wallet;
  cachedKey = key;
  return wallet;
}

export interface OrgBalances {
  sats: bigint;
  satsOwned: bigint;
  satsIncoming: bigint;
  usdb: bigint;
}

export async function getOrgBalances(wallet: SparkWallet): Promise<OrgBalances> {
  const b = await wallet.getBalance();
  const token = b.tokenBalances.get(USDB_TOKEN_ID);
  const usdb = token ? token.ownedBalance : BigInt(0);
  return {
    sats: b.satsBalance.available,
    satsOwned: b.satsBalance.owned,
    satsIncoming: b.satsBalance.incoming,
    usdb,
  };
}

export async function getOrgSparkAddress(wallet: SparkWallet): Promise<string> {
  return wallet.getSparkAddress();
}

export async function getOrgStaticDepositAddress(wallet: SparkWallet): Promise<string> {
  return wallet.getStaticDepositAddress();
}

export async function createOrgLightningInvoice(
  wallet: SparkWallet,
  amountSats: number,
  memo?: string,
): Promise<{ invoice: string; id: string; expiresAt?: string }> {
  const res = await wallet.createLightningInvoice({ amountSats, memo });
  return {
    invoice: res.invoice.encodedInvoice,
    id: res.id,
    expiresAt: res.invoice.expiresAt,
  };
}

export async function payOrgLightningInvoice(
  wallet: SparkWallet,
  invoice: string,
  maxFeeSats?: number,
): Promise<unknown> {
  return wallet.payLightningInvoice({ invoice, maxFeeSats });
}

export async function sendUsdb(
  wallet: SparkWallet,
  receiverSparkAddress: string,
  amount: number,
): Promise<string> {
  const tokenAmount = BigInt(Math.round(amount * 10 ** USDB_DECIMALS));
  return wallet.transferTokens({
    tokenIdentifier: USDB_TOKEN_ID,
    tokenAmount,
    receiverSparkAddress,
  });
}

export async function withdrawOnchain(
  wallet: SparkWallet,
  onchainAddress: string,
  amountSats: number,
  exitSpeed: ExitSpeed = "FAST" as ExitSpeed,
): Promise<unknown> {
  return wallet.withdraw({ onchainAddress, amountSats, exitSpeed });
}

export async function getOrgTransfers(wallet: SparkWallet, limit = 25): Promise<WalletTransfer[]> {
  const res = await wallet.getTransfers(limit);
  return res.transfers;
}

/** Format a USDB bigint amount for display (6 decimals). */
export function formatUsdb(amount: bigint): string {
  const units = 10 ** USDB_DECIMALS;
  const whole = amount / BigInt(units);
  const frac = (amount % BigInt(units)).toString().padStart(USDB_DECIMALS, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}
