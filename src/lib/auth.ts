import { useSyncExternalStore } from "react";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { npubEncode } from "nostr-tools/nip19";
import { privateKeyFromSeedWords } from "nostr-tools/nip06";
import * as nip44 from "nostr-tools/nip44";
import { entropyToMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { EventTemplate, VerifiedEvent } from "nostr-tools";

/**
 * Authentication: passkeys (WebAuthn PRF), nsec, or a NIP-07 extension.
 *
 * The signer unifies all three methods behind one interface so the rest of the
 * app never cares where the key lives. Secret keys are kept in memory only and
 * never persisted; passkeys re-derive their key via the PRF extension on every
 * unlock, so nothing secret needs to hit localStorage.
 */

export type AuthMethod = "passkey" | "nsec" | "nip07";

export interface NostrSigner {
  method: AuthMethod;
  pubkey: string;
  npub: string;
  signEvent(template: EventTemplate): Promise<VerifiedEvent>;
  nip44EncryptTo(pubkey: string, plaintext: string): Promise<string>;
  nip44DecryptFrom(pubkey: string, payload: string): Promise<string>;
  /** Raw secret key. Only available for local (passkey/nsec) signers. */
  secretKey?: Uint8Array;
  /** Backup seed words. Only for passkeys (NIP-06-compatible mnemonic). */
  mnemonic?: string;
}

export interface AuthState {
  signer: NostrSigner | null;
}

const STORAGE_KEY = "bitmoot.auth.v1";
/** Fixed PRF salt — never change it, it would brick existing orgs/npubs. */
const PRF_SALT = Uint8Array.from(new TextEncoder().encode("bitmoot.org/passkey/v1"));

interface PersistedAuth {
  method?: AuthMethod;
  displayName?: string;
  credentialId?: string; // base64url rawId of the passkey
}

function loadPersisted(): PersistedAuth {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as PersistedAuth;
  } catch {
    return {};
  }
}

function persist(patch: PersistedAuth) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadPersisted(), ...patch }));
  } catch {
    /* ignore */
  }
}

export function lastMethod(): AuthMethod | undefined {
  return loadPersisted().method;
}

export function hasStoredPasskey(): boolean {
  return Boolean(loadPersisted().credentialId);
}

let state: AuthState = { signer: null };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getAuth(): AuthState {
  return state;
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getAuth, getAuth);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function setSigner(signer: NostrSigner | null) {
  state = { signer };
  emit();
}

export function signOut() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  setSigner(null);
}

/** Build a local signer that holds the raw secret key in memory. */
function localSigner(
  method: AuthMethod,
  secretKey: Uint8Array,
  mnemonic?: string,
): NostrSigner {
  const pubkey = getPublicKey(secretKey);
  return {
    method,
    pubkey,
    npub: npubEncode(pubkey),
    secretKey,
    mnemonic,
    signEvent: async (template) => finalizeEvent(template, secretKey),
    nip44EncryptTo: async (toPubkey, plaintext) =>
      nip44.encrypt(plaintext, nip44.getConversationKey(secretKey, toPubkey)),
    nip44DecryptFrom: async (fromPubkey, payload) =>
      nip44.decrypt(payload, nip44.getConversationKey(secretKey, fromPubkey)),
  };
}

/** Decode an nsec string and sign in. */
export async function signInWithNsec(nsec: string): Promise<NostrSigner> {
  const { decode } = await import("nostr-tools/nip19");
  let key: Uint8Array | undefined;
  try {
    const decoded = decode(nsec.trim());
    if (decoded.type === "nsec") key = decoded.data;
  } catch {
    /* fallthrough */
  }
  if (!key || key.length !== 32) throw new Error("Invalid nsec key");
  const signer = localSigner("nsec", key);
  persist({ method: "nsec" });
  setSigner(signer);
  return signer;
}

/** Sign in with a NIP-07 browser extension. */
export async function signInWithNip07(): Promise<NostrSigner> {
  if (!window.nostr) throw new Error("No NIP-07 extension found (install Alby or nos2x)");
  const pubkey = await window.nostr.getPublicKey();
  if (!/^[0-9a-f]{64}$/.test(pubkey)) throw new Error("Extension returned an invalid pubkey");
  const signer: NostrSigner = {
    method: "nip07",
    pubkey,
    npub: npubEncode(pubkey),
    signEvent: async (template) => {
      const signed = await window.nostr!.signEvent(template);
      return signed as VerifiedEvent;
    },
    nip44EncryptTo: async (to, plaintext) => {
      if (!window.nostr?.nip44) throw new Error("Your extension does not support NIP-44");
      return window.nostr.nip44.encrypt(to, plaintext);
    },
    nip44DecryptFrom: async (from, payload) => {
      if (!window.nostr?.nip44) throw new Error("Your extension does not support NIP-44");
      return window.nostr.nip44.decrypt(from, payload);
    },
  };
  persist({ method: "nip07" });
  setSigner(signer);
  return signer;
}

// ---------------------------------------------------------------------------
// Passkeys (WebAuthn + PRF)
// ---------------------------------------------------------------------------

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(new ArrayBuffer(n));
  crypto.getRandomValues(b);
  return b;
}

function base64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(s: string): Uint8Array {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(norm + "=".repeat((4 - (norm.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Passkey → PRF secret → BIP-39 mnemonic → NIP-06 nostr key. */
function deriveFromPrfSecret(prfSecret: Uint8Array): { secretKey: Uint8Array; mnemonic: string } {
  if (prfSecret.length !== 32) throw new Error("Unexpected PRF output length");
  const mnemonic = entropyToMnemonic(prfSecret, wordlist);
  const secretKey = privateKeyFromSeedWords(mnemonic); // m/44'/1237'/0'/0/0
  return { secretKey, mnemonic };
}

function prfExtensionResult(result: AuthenticationExtensionsClientOutputs | null): Uint8Array | null {
  const first = (result as { prf?: { results?: { first?: ArrayBuffer } } } | undefined)?.prf
    ?.results?.first;
  return first ? new Uint8Array(first) : null;
}

/** Register a new passkey. Evaluates PRF immediately when the platform allows. */
export async function registerPasskey(displayName: string): Promise<NostrSigner> {
  if (!navigator.credentials?.create) throw new Error("WebAuthn is not available in this browser");
  const userId = randomBytes(16);
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      user: { id: userId, name: displayName, displayName },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      rp: { name: "BitMoot" },
      extensions: { prf: { eval: { first: PRF_SALT } } },
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey registration was cancelled");

  const prfSecret = prfExtensionResult(credential.getClientExtensionResults());
  persist({
    method: "passkey",
    displayName,
    credentialId: base64urlEncode(new Uint8Array(credential.rawId)),
  });
  if (prfSecret) {
    const { secretKey, mnemonic } = deriveFromPrfSecret(prfSecret);
    const signer = localSigner("passkey", secretKey, mnemonic);
    setSigner(signer);
    return signer;
  }
  // Some platforms only evaluate PRF on credentials.get(); do that now.
  return unlockPasskey();
}

/** Unlock with an existing passkey, evaluating PRF to re-derive the nostr key. */
export async function unlockPasskey(): Promise<NostrSigner> {
  if (!navigator.credentials?.get) throw new Error("WebAuthn is not available in this browser");
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      userVerification: "required",
      extensions: { prf: { eval: { first: PRF_SALT } } },
    },
  })) as PublicKeyCredential | null;
  if (!assertion) throw new Error("Passkey unlock was cancelled");

  const prfSecret = prfExtensionResult(assertion.getClientExtensionResults());
  if (!prfSecret) {
    throw new Error(
      "This authenticator does not support the PRF extension. Use an nsec key instead.",
    );
  }
  const { secretKey, mnemonic } = deriveFromPrfSecret(prfSecret);
  const signer = localSigner("passkey", secretKey, mnemonic);
  setSigner(signer);
  return signer;
}

/** Restore a mnemonic (e.g. an exported passkey/nsec backup) directly. */
export async function signInWithMnemonic(mnemonic: string): Promise<NostrSigner> {
  if (!validateMnemonic(mnemonic.trim(), wordlist)) throw new Error("Invalid seed words");
  const secretKey = privateKeyFromSeedWords(mnemonic.trim());
  const signer = localSigner("nsec", secretKey, mnemonic.trim());
  persist({ method: "nsec" });
  setSigner(signer);
  return signer;
}

export { base64urlEncode, base64urlDecode };
