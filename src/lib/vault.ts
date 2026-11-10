import { p2tr, p2tr_ms, Transaction, NETWORK } from "@scure/btc-signer";
import { tapLeafHash } from "@scure/btc-signer/payment.js";
import { PSBTCombine } from "@scure/btc-signer/transaction.js";
import type { TransactionInput } from "@scure/btc-signer/psbt.js";
import { bitcoinNetwork, getSettings } from "./settings";
import { hexToBytes, toHex } from "./keys";

/**
 * On-chain vault: P2TR M-of-N multisig over member vault signer x-only keys
 * (`CHECKSIGADD` tapscript leaf). UTXO lookups and broadcast go through an
 * esplora-compatible API (mempool.space on mainnet, configurable for regtest).
 */

export type BtcNetwork = ReturnType<typeof bitcoinNetwork>;

const REGTEST_NETWORK = Object.freeze({
  bech32: "bcrt",
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
});

function networkParams() {
  return bitcoinNetwork() === "regtest" ? REGTEST_NETWORK : NETWORK;
}

export interface VaultInfo {
  address: string;
  scriptHex: string;
  tapLeafScript: NonNullable<TransactionInput["tapLeafScript"]>;
  threshold: number;
  signers: string[];
}

/** Build the vault descriptor from member x-only keys (sorted deterministically). */
export function buildVault(threshold: number, xOnlyPubkeysHex: string[]): VaultInfo {
  const signers = [...new Set(xOnlyPubkeysHex)].sort();
  if (signers.length < threshold) throw new Error("Vault needs at least as many signers as the threshold");
  const keys = signers.map(hexToBytes);
  const leaf = p2tr_ms(threshold, keys);
  const spend = p2tr(undefined, [{ script: leaf.script }], networkParams());
  const tapLeafScript = spend.tapLeafScript;
  if (!tapLeafScript) throw new Error("Vault leaf script missing");
  return {
    address: spend.address,
    scriptHex: toHex(spend.script),
    tapLeafScript,
    threshold,
    signers,
  };
}

// ---------------------------------------------------------------------------
// Explorer (esplora-compatible) API
// ---------------------------------------------------------------------------

const DUST = 546n;

export interface Utxo {
  txid: string;
  vout: number;
  value: number;
  confirmations?: number;
}

export function explorerBase(): string {
  const s = getSettings();
  if (s.explorerApiBase) return s.explorerApiBase.replace(/\/$/, "");
  return s.network === "REGTEST" ? "http://localhost:3000/api" : "https://mempool.space/api";
}

/** Human-facing explorer UI base (API base with a trailing /api stripped). */
export function explorerUiBase(): string {
  return explorerBase().replace(/\/api$/, "");
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${explorerBase()}${path}`, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Explorer API ${res.status}: ${body || res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function fetchUtxos(address: string): Promise<Utxo[]> {
  return api<Utxo[]>(`/address/${address}/utxo`);
}

export async function fetchAddressBalance(address: string): Promise<bigint> {
  const info = await api<{
    chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
    mempool_stats: { funded_txo_sum: number; spent_txo_sum: number };
  }>(`/address/${address}`);
  return BigInt(info.chain_stats.funded_txo_sum - info.chain_stats.spent_txo_sum);
}

export async function fetchRecommendedFeeRate(): Promise<number> {
  try {
    const fees = await api<{ fastestFee: number; halfHourFee: number; hourFee: number }>(
      "/v1/fees/recommended",
    );
    return fees.fastestFee || 5;
  } catch {
    return 5;
  }
}

export async function broadcastTx(rawHex: string): Promise<string> {
  const res = await fetch(`${explorerBase()}/tx`, {
    method: "POST",
    body: rawHex,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Broadcast failed: ${body || res.statusText}`);
  }
  return res.text();
}

export async function fetchTxStatus(txid: string): Promise<{ confirmed: boolean; block_height?: number }> {
  return api(`/tx/${txid}/status`);
}

// ---------------------------------------------------------------------------
// PSBT construction / signing / combining
// ---------------------------------------------------------------------------

/**
 * Measure the virtual size of an unsigned vault spend by finalizing a clone
 * with dummy signatures (finalizers assemble witnesses without verifying
 * signatures, so the measurement is byte-exact).
 */
function estimateVsize(tx: Transaction, vault: VaultInfo): number {
  const clone = tx.clone();
  const leaf = vault.tapLeafScript[0];
  if (!leaf) throw new Error("Vault has no leaf script");
  const [, scriptWithVersion] = leaf;
  const script = scriptWithVersion.slice(0, -1);
  const version = scriptWithVersion[scriptWithVersion.length - 1];
  const leafHash = tapLeafHash(script, version);
  const dummySig = new Uint8Array(64);
  type SigEntry = [{ pubKey: Uint8Array<ArrayBuffer>; leafHash: Uint8Array<ArrayBuffer> }, Uint8Array<ArrayBuffer>];
  const required: SigEntry[] = [];
  for (const pkHex of vault.signers.slice(0, vault.threshold)) {
    required.push([{ pubKey: hexToBytes(pkHex), leafHash }, dummySig]);
  }
  for (let i = 0; i < clone.inputsLength; i++) {
    clone.updateInput(i, { tapScriptSig: required });
    clone.finalizeIdx(i);
  }
  return clone.vsize;
}

export interface SpendRequest {
  vault: VaultInfo;
  utxos: Utxo[];
  recipientAddress: string;
  amountSats: bigint;
  feeRate: number;
}

export interface BuiltSpend {
  tx: Transaction;
  psbtBase64: string;
  fee: bigint;
  change: bigint;
  txid: string;
}

/** Create an unsigned vault spend (with change back to the vault address). */
export function buildVaultSpend(req: SpendRequest): BuiltSpend {
  const total = req.utxos.reduce((s, u) => s + BigInt(u.value), 0n);
  if (total < req.amountSats + DUST) throw new Error("Insufficient vault funds");

  const build = (withChange: boolean): { tx: Transaction; changeIdx: number } => {
    const tx = new Transaction();
    for (const u of req.utxos) {
      tx.addInput({
        txid: u.txid,
        index: u.vout,
        witnessUtxo: { script: hexToBytes(req.vault.scriptHex), amount: BigInt(u.value) },
        tapLeafScript: req.vault.tapLeafScript,
      });
    }
    tx.addOutputAddress(req.recipientAddress, req.amountSats, networkParams());
    let changeIdx = -1;
    if (withChange) changeIdx = tx.addOutputAddress(req.vault.address, 0n, networkParams());
    return { tx, changeIdx };
  };

  const { tx, changeIdx } = build(true);
  const fee = BigInt(Math.ceil(estimateVsize(tx, req.vault) * req.feeRate));
  const change = total - req.amountSats - fee;
  if (change < DUST) {
    // Change not worth keeping: sweep it to fees.
    const rebuilt = build(false);
    const sweepFee = total - req.amountSats;
    if (sweepFee > fee * 3n) throw new Error("Fee too high for this spend, lower the fee rate");
    return {
      tx: rebuilt.tx,
      psbtBase64: toBase64(rebuilt.tx.toPSBT()),
      fee: sweepFee,
      change: 0n,
      txid: rebuilt.tx.id,
    };
  }
  tx.updateOutput(changeIdx, { amount: change });
  return { tx, psbtBase64: toBase64(tx.toPSBT()), fee, change, txid: tx.id };
}

/** Load a PSBT from base64. */
export function loadPsbt(psbtBase64: string): Transaction {
  return Transaction.fromPSBT(fromBase64(psbtBase64));
}

/** Serialize a transaction PSBT as base64. */
export function psbtToBase64(tx: Transaction): string {
  return toBase64(tx.toPSBT());
}

/** Sign a PSBT in place with a vault signer secret key. */
export function signPsbt(psbtBase64: string, secretKey: Uint8Array): string {
  const tx = loadPsbt(psbtBase64);
  tx.sign(secretKey);
  return psbtToBase64(tx);
}

/** Number of distinct taproot script signatures collected on input 0. */
export function countTapScriptSigs(tx: Transaction): number {
  let count = 0;
  for (let i = 0; i < tx.inputsLength; i++) {
    count = Math.max(count, tx.getInput(i).tapScriptSig?.length ?? 0);
  }
  return count;
}

/** Combine multiple PSBTs (same unsigned tx, different partial signatures). */
export function combinePsbts(psbtBase64s: string[]): Transaction {
  const combined = PSBTCombine(psbtBase64s.map(fromBase64));
  return Transaction.fromPSBT(combined);
}

/** Finalize a combined PSBT and extract the raw transaction hex. */
export function finalizeAndExtract(tx: Transaction): string {
  for (let i = 0; i < tx.inputsLength; i++) tx.finalizeIdx(i);
  return toHex(tx.extract());
}

// ---------------------------------------------------------------------------
// base64 helpers (PSBTs travel through Nostr content as JSON strings)
// ---------------------------------------------------------------------------

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
