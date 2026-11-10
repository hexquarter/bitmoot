import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { secp256k1, schnorr } from "@noble/curves/secp256k1.js";
import { getPublicKey } from "nostr-tools/pure";
import { npubEncode } from "nostr-tools/nip19";

/**
 * Deterministic key derivations.
 *
 * - Org wallet seed (24 words) funds the Spark wallet.
 * - The same seed derives the org's nostr identity key (custom hardened path),
 *   so anyone holding the seed can sign org config events.
 * - Each member's vault signer is derived from their personal nostr secret,
 *   so co-signing PSBTs never requires the org seed.
 */

/** Derivation path for the org nostr identity key. */
const ORG_NOSTR_PATH = "m/44'/1237'/7777'/0'/0'";

/** Generate a fresh 24-word org wallet seed. */
export function generateOrgSeed(): string {
  const entropy = new Uint8Array(32);
  crypto.getRandomValues(entropy);
  return entropyToMnemonic(entropy, wordlist);
}

/** Org nostr identity key derived from the org wallet seed. */
export function orgNostrKeys(mnemonic: string): { secretKey: Uint8Array; pubkey: string; npub: string } {
  const seed = mnemonicToSeedSync(mnemonic);
  const hd = HDKey.fromMasterSeed(seed);
  const child = hd.derive(ORG_NOSTR_PATH);
  if (!child.privateKey) throw new Error("Failed to derive org nostr key");
  const secretKey = child.privateKey;
  const pubkey = getPublicKey(secretKey);
  return { secretKey, pubkey, npub: npubEncode(pubkey) };
}

/** Member's vault signer secret (BIP340 x-only) derived from their nostr secret key. */
export function vaultSignerKeys(memberNostrSecretKey: Uint8Array): {
  secretKey: Uint8Array;
  xOnlyPubkey: Uint8Array;
  xOnlyPubkeyHex: string;
} {
  const digest = hmac(sha256, memberNostrSecretKey, new TextEncoder().encode("bitmoot/vault/signer/v1"));
  const scalar = BigInt(`0x${toHex(digest)}`) % secp256k1.CURVE.n;
  if (scalar === 0n) throw new Error("Vault signer derivation produced an invalid key");
  const secretKey = hexToBytes(scalar.toString(16).padStart(64, "0"));
  const xOnlyPubkey = schnorr.getPublicKey(secretKey);
  return { secretKey, xOnlyPubkey, xOnlyPubkeyHex: toHex(xOnlyPubkey) };
}

/** X-only (BIP340) pubkey for a raw vault signer secret. */
export function vaultXOnlyFromSecret(secretKey: Uint8Array): string {
  return toHex(schnorr.getPublicKey(secretKey));
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 || !/^[0-9a-fA-F]*$/.test(hex)) throw new Error("Invalid hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
