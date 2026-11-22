import { useSyncExternalStore } from "react";
import { finalizeEvent } from "nostr-tools/pure";
import { decode as nip19Decode, npubEncode } from "nostr-tools/nip19";
import * as nip44 from "nostr-tools/nip44";
import type { Event, EventTemplate, VerifiedEvent } from "nostr-tools";
import { Kind, publish, subscribe, query, orgAddressTag, parseJsonContent, tagValue, relays } from "./nostr";
import { getSettings, setSettings, subscribeSettings } from "./settings";
import { getAuth, subscribeAuth, type NostrSigner } from "./auth";
import {
  generateOrgSeed,
  orgNostrKeys,
  vaultSignerKeys,
  vaultXOnlyFromSecret,
  hexToBytes,
  toHex,
} from "./keys";
import {
  buildVault,
  buildVaultSpend,
  signPsbt,
  combinePsbts,
  countTapScriptSigs,
  finalizeAndExtract,
  loadPsbt,
  fetchUtxos,
  fetchRecommendedFeeRate,
  broadcastTx,
  verifyVaultSpendPsbt,
  verifyMigrationPsbt,
  type VaultInfo,
  type Utxo,
} from "./vault";
import {
  disconnectOrgWallet, connectOrgWallet, getOrgBalances, getOrgSparkAddress,
  sendSatsToSparkAddress, sendUsdb, USDB_DECIMALS, withdrawOnchain,
} from "./spark";

/**
 * Org data layer. Everything an org publishes lives on Nostr under a single
 * addressable identity derived from the org wallet seed:
 *
 *   30078  OrgConfig   (org key, d=bitmoot)  — name, council, threshold, vault signers
 *   30079  WalletShare (org key → member)   — NIP-44 encrypted org seed
 *   30080  VaultSigner (member, d=bitmoot)   — member vault x-only pubkey
 *   30081  PsbtCosign  (member, d=proposal) — PSBT exchange for vault spends
 *   37000  Proposal    (member, d=uuid)      — NIP-44 encrypted for org members
 *   30052  Vote        (member, d=proposal)  — encrypted, replaceable: latest vote wins
 *   9705   Execution   (member, d=proposal)  — broadcast record
 *   9703   JoinRequest (joiner, d=bitmoot)   — ask to join, includes vault key
 *   1      Feed post   (member)              — tagged to the org
 */

/** The single org identifier: one org per org key. */
export const ORG_ID = "bitmoot";

export function orgAddress(orgPubkey: string): string {
  return orgAddressTag(orgPubkey, ORG_ID);
}

/** Public org config is cached locally so reloads work even if relays are slow. */
function orgConfigCacheKey(orgPubkey: string): string {
  return `bitmoot.org.config.${orgPubkey}`;
}

function cacheOrgConfig(orgPubkey: string, config: OrgConfig) {
  try {
    localStorage.setItem(orgConfigCacheKey(orgPubkey), JSON.stringify(config));
  } catch {
    /* ignore */
  }
}

function cachedOrgConfig(orgPubkey: string): OrgConfig | null {
  try {
    const raw = localStorage.getItem(orgConfigCacheKey(orgPubkey));
    if (!raw) return null;
    const config = JSON.parse(raw) as OrgConfig;
    return Array.isArray(config?.council) && Array.isArray(config?.vaultSigners) ? config : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrgConfig {
  version: 1;
  name: string;
  description: string;
  /** M of N: required votes AND required vault signatures. */
  threshold: number;
  /** Council member nostr pubkeys (hex). */
  council: string[];
  /** Authoritative vault signer x-only keys (hex). */
  vaultSigners: string[];
  /**
   * Operational cap: max sats kept spendable in the hot Spark wallet. Excess
   * is swept to the reserve vault, and hot payments above the cap are refused
   * in favour of a multisig-settled on-chain proposal. Undefined = no cap.
   */
  hotCapSats?: number;
  /** Vaults replaced by a signer-set/threshold change; their balance is migratable. */
  retiredVaults?: RetiredVault[];
  /** Who may write content and proposals. Absent = defaults (admins post, members propose). */
  permissions?: Partial<OrgPermissions>;
  createdAt: number;
}

/** A vault address that no longer matches the current signer set. */
export interface RetiredVault {
  threshold: number;
  /** x-only keys that could spend it (the signer set at retirement time). */
  signers: string[];
  address: string;
  scriptHex: string;
  retiredAt: number;
}

export interface OrgMember {
  pubkey: string;
  npub: string;
  vaultXOnly: string | null;
  isCouncil: boolean;
  joinedAt?: number;
}

export type VoteChoice = "yes" | "no" | "abstain";
export type PaymentMethod = "lightning" | "usdb" | "onchain";

/**
 * NIP-44 multi-recipient envelope. The event tags identify the org; each
 * member gets their own ciphertext so no proposal details sit in plain text.
 */
interface EncryptedContent {
  v: 1;
  alg: "nip44";
  recipients: Record<string, string>;
}

function isEncryptedContent(value: unknown): value is EncryptedContent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EncryptedContent>;
  return (
    candidate.v === 1 &&
    candidate.alg === "nip44" &&
    Boolean(candidate.recipients) &&
    typeof candidate.recipients === "object" &&
    Object.values(candidate.recipients).every((cipher) => typeof cipher === "string")
  );
}

function parseJsonString<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Read a governance payload from cache (encrypted) or directly (legacy plaintext). */
function governancePayload<T>(event: Event): T | null {
  const cached = decryptedContent.get(event.id);
  if (cached) return parseJsonString<T>(cached);
  const raw = parseJsonContent<unknown>(event);
  if (isEncryptedContent(raw)) return null;
  return (raw ?? null) as T | null;
}

function isEncryptedEvent(event: Event): boolean {
  return isEncryptedContent(parseJsonContent<unknown>(event));
}

/**
 * Encrypt a proposal or vote once per org member. Each recipient gets their
 * own NIP-44 ciphertext, so the event payload is never readable by non-members.
 */
async function encryptedGovernancePayload(payload: unknown): Promise<{
  content: string;
  recipients: string[];
}> {
  const signer = requireSigner();
  const recipients = [...new Set([...state.memberPubkeys, signer.pubkey])].filter((pubkey) =>
    /^[0-9a-f]{64}$/.test(pubkey),
  );
  if (!recipients.length) throw new Error("Org members are not loaded yet");

  const plaintext = JSON.stringify(payload);
  const recipientCiphers = await Promise.all(
    recipients.map(async (pubkey) => [pubkey, await signer.nip44EncryptTo(pubkey, plaintext)] as const),
  );
  return {
    content: JSON.stringify({
      v: 1,
      alg: "nip44",
      recipients: Object.fromEntries(recipientCiphers),
    } satisfies EncryptedContent),
    recipients,
  };
}

/** Role of the signed-in Nostr identity in the active org. */
export type OrgRole = "admin" | "member" | "pending" | "guest";

export interface ProposalView {
  id: string;
  author: string;
  createdAt: number;
  title: string;
  body: string;
  type: "payment" | "general" | "config";
  /** Set for config proposals: the governance change being voted on. */
  configChange?: ConfigChangeInput;
  /** Set for payment proposals so Payments can unlock only approved methods. */
  paymentMethod?: PaymentMethod;
  /** Invoice, Spark address, or Bitcoin address approved by the proposal. */
  payee?: string;
  amountSats?: number;
  /** USDB proposals use a dollar amount instead of sats. */
  amountUsd?: number;
  onchainAddress?: string;
  votes: { author: string; choice: VoteChoice; createdAt: number }[];
  yesCount: number;
  noCount: number;
  /** True when the on-chain payload was encrypted for org members. */
  encrypted?: boolean;
  passed: boolean;
  executed: boolean;
  execution?: {
    txid: string;
    createdAt: number;
    reference?: string;
    method?: PaymentMethod | "vault";
  };
  psbtSigs: number;
}

export interface FeedPost {
  id: string;
  author: string;
  content: string;
  createdAt: number;
}

export interface JoinRequestView {
  author: string;
  note: string;
  createdAt: number;
  vaultXOnly: string | null;
}

export interface OrgState {
  orgPubkey: string | null;
  orgNpub: string | null;
  config: OrgConfig | null;
  members: OrgMember[];
  /** Pubkeys allowed to read encrypted governance payloads and vote. */
  memberPubkeys: string[];
  vault: VaultInfo | null;
  vaultComplete: boolean;
  proposals: ProposalView[];
  feed: FeedPost[];
  joinRequests: JoinRequestView[];
  loading: boolean;
  seedUnlocked: boolean;
  /** Role of the current signer; null until an org is loaded. */
  myRole: OrgRole | null;
}

const EMPTY_STATE: OrgState = {
  orgPubkey: null,
  orgNpub: null,
  config: null,
  members: [],
  memberPubkeys: [],
  vault: null,
  vaultComplete: false,
  proposals: [],
  feed: [],
  joinRequests: [],
  loading: false,
  seedUnlocked: false,
  myRole: null,
};

export function shortNpub(pubkeyOrNpub: string): string {
  try {
    const npub = pubkeyOrNpub.startsWith("npub") ? pubkeyOrNpub : npubEncode(pubkeyOrNpub);
    return `${npub.slice(0, 10)}…${npub.slice(-6)}`;
  } catch {
    return `${pubkeyOrNpub.slice(0, 8)}…${pubkeyOrNpub.slice(-4)}`;
  }
}

export function npubToHex(npub: string): string {
  const decoded = nip19Decode(npub.trim());
  if (decoded.type !== "npub") throw new Error("Expected npub");
  return decoded.data as string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const store = {
  events: new Map<string, Event>(), // deduped raw events
  byKindAuthorD: new Map<string, Event>(), // latest addressable: `${kind}:${author}:${d}`
  seed: null as string | null,
  walletSeed: null as string | null,
  unsub: null as null | (() => void),
  subKey: "",
};

/** Decrypted NIP-44 payloads, keyed by event id. Never persisted. */
const decryptedContent = new Map<string, string>();
const decryptAttempted = new Map<string, string>();

let state: OrgState = EMPTY_STATE;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribeStore(cb: () => void) {
  // Keep the singleton subscription alive across React's StrictMode
  // unsubscribe/resubscribe cycle. Closing it here used to leave a stale
  // subKey, so the next subscribe never reopened it and the org never loaded.
  ensureSubscribed();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useOrg(): OrgState {
  return useSyncExternalStore(subscribeStore, () => state, () => state);
}

/** Decrypt an encrypted governance payload for the current signer, then refresh state. */
async function decryptForCurrentSigner(event: Event): Promise<void> {
  const signer = getAuth().signer;
  if (!signer) return;
  const envelope = parseJsonContent<unknown>(event);
  if (!isEncryptedContent(envelope)) return;

  const attempt = `${signer.pubkey}:${event.id}`;
  if (decryptAttempted.get(event.id) === attempt) return;
  decryptAttempted.set(event.id, attempt);

  const ciphertext = envelope.recipients[signer.pubkey];
  if (!ciphertext) return;
  try {
    const plain = await signer.nip44DecryptFrom(event.pubkey, ciphertext);
    decryptedContent.set(event.id, plain);
  } catch {
    decryptedContent.delete(event.id);
  } finally {
    rebuild();
  }
}

/** Re-attempt every encrypted payload after an identity switch. */
function refreshEncryptedContent() {
  decryptedContent.clear();
  decryptAttempted.clear();
  const events = [...store.events.values(), ...store.byKindAuthorD.values()];
  for (const event of events) {
    if (event.kind === Kind.Proposal || event.kind === Kind.Vote) {
      void decryptForCurrentSigner(event);
    }
  }
  rebuild();
}

function ingest(event: Event) {
  const d = tagValue(event, "d");
  const key = `${event.kind}:${event.pubkey}:${d ?? ""}`;
  if (d !== undefined) {
    const existing = store.byKindAuthorD.get(key);
    if (existing && existing.created_at > event.created_at) return;
    store.byKindAuthorD.set(key, event);
  } else if (store.events.has(event.id)) {
    return;
  } else {
    store.events.set(event.id, event);
  }
  if (event.kind === Kind.Proposal || event.kind === Kind.Vote) {
    void decryptForCurrentSigner(event);
  }
  rebuild();
}

/** (Re)build derived state from raw events. */
function rebuild() {
  const orgPubkey = state.orgPubkey;
  if (!orgPubkey) return;

  const configEv = latest(Kind.OrgConfig, orgPubkey, ORG_ID);
  const liveConfig = configEv ? parseJsonContent<OrgConfig>(configEv) : null;
  const config = liveConfig ?? cachedOrgConfig(orgPubkey);
  if (liveConfig) cacheOrgConfig(orgPubkey, liveConfig);

  const members = new Map<string, OrgMember>();
  if (config) {
    for (const pubkey of config.council) {
      members.set(pubkey, { pubkey, npub: npubEncode(pubkey), vaultXOnly: null, isCouncil: true });
    }
  }
  // vault signers published by anyone
  const signerEvents = collectByKind(Kind.VaultSigner);
  for (const ev of signerEvents) {
    const content = parseJsonContent<{ xOnly: string }>(ev);
    const xOnly = content?.xOnly;
    const member = members.get(ev.pubkey);
    if (member) member.vaultXOnly = xOnly ?? null;
    else if (xOnly) members.set(ev.pubkey, { pubkey: ev.pubkey, npub: npubEncode(ev.pubkey), vaultXOnly: xOnly, isCouncil: false });
  }

  // Wallet-share recipients are full members; council members are admins.
  const memberPubkeys = new Set<string>(config?.council ?? []);
  for (const ev of collectByKind(Kind.WalletShare)) {
    const recipient = tagValue(ev, "p");
    if (recipient) memberPubkeys.add(recipient);
  }

  const myPubkey = getAuth().signer?.pubkey;
  let myRole: OrgRole | null = null;
  if (myPubkey && config) {
    if (config.council.includes(myPubkey)) myRole = "admin";
    else if (memberPubkeys.has(myPubkey)) myRole = "member";
    else if (
      collectByKind(Kind.JoinRequest).some(
        (ev) => ev.pubkey === myPubkey && tagValue(ev, "a") === orgAddress(orgPubkey),
      )
    ) myRole = "pending";
    else myRole = "guest";
  }

  // vault from authoritative signer list in config
  let vault: VaultInfo | null = null;
  let vaultComplete = false;
  if (config && config.vaultSigners.length > 0) {
    if (config.vaultSigners.length >= config.threshold) {
      try {
        vault = buildVault(config.threshold, config.vaultSigners);
        vaultComplete = true;
      } catch {
        vault = null;
      }
    }
  }

  // votes: latest per member per proposal
  const votesByProposal = new Map<string, Map<string, { author: string; choice: VoteChoice; createdAt: number }>>();
  for (const ev of collectByKind(Kind.Vote)) {
    const proposalId = tagValue(ev, "e");
    if (!proposalId) continue;
    const content = governancePayload<{ choice: VoteChoice }>(ev);
    if (!content?.choice) continue;
    const map = votesByProposal.get(proposalId) ?? new Map();
    map.set(ev.pubkey, { author: ev.pubkey, choice: content.choice, createdAt: ev.created_at });
    votesByProposal.set(proposalId, map);
  }

  // executions by proposal
  const executions = new Map<string, NonNullable<ProposalView["execution"]>>();
  for (const ev of collectByKind(Kind.Execution)) {
    const proposalId = tagValue(ev, "e");
    const content = parseJsonContent<{
      txid: string;
      paymentId?: string;
      method?: PaymentMethod | "vault";
    }>(ev);
    if (!proposalId || !content?.txid) continue;
    executions.set(proposalId, {
      txid: content.txid,
      createdAt: ev.created_at,
      reference: content.paymentId ?? content.txid,
      method: content.method,
    });
  }

  // psbt contribution counts per proposal (latest per author only)
  const psbtCounts = new Map<string, number>();
  const psbtByProposal = new Map<string, Map<string, Event>>();
  for (const ev of collectByKind(Kind.PsbtCosign)) {
    const proposalId = tagValue(ev, "e");
    if (!proposalId) continue;
    const content = parseJsonContent<{ psbt: string }>(ev);
    if (!content?.psbt) continue;
    const authors = psbtByProposal.get(proposalId) ?? new Map<string, Event>();
    const existing = authors.get(ev.pubkey);
    if (!existing || existing.created_at < ev.created_at) authors.set(ev.pubkey, ev);
    psbtByProposal.set(proposalId, authors);
  }
  for (const [proposalId, authors] of psbtByProposal) psbtCounts.set(proposalId, authors.size);

  // proposals
  const threshold = config?.threshold ?? Infinity;
  const councilSet = new Set(config?.council ?? []);
  const voterSet = memberPubkeys;
  const proposals: ProposalView[] = [];
  for (const ev of collectByKind(Kind.Proposal)) {
    const content = governancePayload<{
      title: string;
      body: string;
      type: string;
      paymentMethod?: PaymentMethod;
      payee?: string;
      amountSats?: number;
      amountUsd?: number;
      onchainAddress?: string;
      configChange?: ConfigChangeInput;
    }>(ev);
    if (!content) continue;
    const votes = votesByProposal.get(ev.id) ?? new Map();
    const voteList = [...votes.values()];
    const yesCount = voteList.filter((v) => v.choice === "yes" && voterSet.has(v.author)).length;
    const noCount = voteList.filter((v) => v.choice === "no" && voterSet.has(v.author)).length;
    const execution = executions.get(ev.id);
    const configChange =
      content.configChange && typeof content.configChange === "object" && content.configChange.action
        ? content.configChange
        : undefined;
    proposals.push({
      id: ev.id,
      author: ev.pubkey,
      createdAt: ev.created_at,
      title: content.title,
      body: content.body,
      type: content.type === "payment" ? "payment" : content.type === "config" ? "config" : "general",
      configChange,
      paymentMethod:
        content.type !== "payment"
          ? undefined
          : content.paymentMethod ?? (content.onchainAddress ? "onchain" : undefined),
      payee: content.type === "payment" ? content.payee ?? content.onchainAddress : undefined,
      amountSats: content.amountSats,
      amountUsd: content.amountUsd,
      onchainAddress: content.onchainAddress,
      votes: voteList,
      yesCount,
      noCount,
      encrypted: isEncryptedEvent(ev),
      passed: yesCount >= threshold,
      executed: Boolean(execution),
      execution,
      psbtSigs: psbtCounts.get(ev.id) ?? 0,
    });
  }
  proposals.sort((a, b) => b.createdAt - a.createdAt);

  // feed (kind 1)
  const feed: FeedPost[] = [...store.events.values()]
    .filter((ev) => ev.kind === 1)
    .map((ev) => ({ id: ev.id, author: ev.pubkey, content: ev.content, createdAt: ev.created_at }))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 200);

  // join requests: kind 9703 by non-council members
  const joinRequests: JoinRequestView[] = [];
  for (const ev of collectByKind(Kind.JoinRequest)) {
    if (councilSet.has(ev.pubkey)) continue;
    const content = parseJsonContent<{ note?: string; name?: string }>(ev);
    joinRequests.push({
      author: ev.pubkey,
      note: content?.note ?? content?.name ?? "",
      createdAt: ev.created_at,
      vaultXOnly: members.get(ev.pubkey)?.vaultXOnly ?? null,
    });
  }
  joinRequests.sort((a, b) => b.createdAt - a.createdAt);

  state = {
    orgPubkey,
    orgNpub: npubEncode(orgPubkey),
    config,
    members: [...members.values()],
    memberPubkeys: [...memberPubkeys],
    vault,
    vaultComplete,
    proposals,
    feed,
    joinRequests,
    loading: false,
    seedUnlocked: myRole === "admin" && store.seed !== null,
    myRole,
  };
  emit();
}

function latest(kind: number, author: string, d: string): Event | undefined {
  return store.byKindAuthorD.get(`${kind}:${author}:${d}`);
}

function collectByKind(kind: number): Event[] {
  const out: Event[] = [];
  for (const [key, ev] of store.byKindAuthorD) {
    if (ev.kind === kind) out.push(ev);
    void key;
  }
  // plain (non-addressable) events like kind 1 live in store.events
  if (kind === 1) return [...store.events.values()].filter((ev) => ev.kind === 1);
  return out;
}

/** Open (or move) the org subscription. Called lazily by React and on settings changes. */
function ensureSubscribed() {
  const settings = getSettings();
  const npub = settings.activeOrgNpub;
  const key = `${npub ?? ""}|${relays().join(",")}`;
  if (store.subKey === key) return;

  store.unsub?.();
  store.unsub = null;
  store.subKey = key;
  store.events.clear();
  store.byKindAuthorD.clear();
  decryptedContent.clear();
  decryptAttempted.clear();
  state = { ...EMPTY_STATE, loading: Boolean(npub) };

  if (!npub) {
    emit();
    return;
  }

  let orgPubkey: string;
  try {
    orgPubkey = npubToHex(npub);
  } catch {
    state = { ...EMPTY_STATE, loading: false };
    emit();
    return;
  }

  state = { ...EMPTY_STATE, orgPubkey, orgNpub: npub, loading: true };
  emit();

  const addr = orgAddress(orgPubkey);
  store.unsub = subscribe(
    {
      "#a": [addr],
      kinds: [
        Kind.OrgConfig,
        Kind.WalletShare,
        Kind.VaultSigner,
        Kind.PsbtCosign,
        Kind.Proposal,
        Kind.Vote,
        Kind.Execution,
        Kind.JoinRequest,
        1,
      ],
    },
    (event) => ingest(event),
  );
  rebuild();
}

subscribeSettings(() => ensureSubscribed());
// Auth changes must never carry an unlocked org seed or decrypted payloads
// into another identity.
subscribeAuth(() => {
  lockTreasury();
  refreshEncryptedContent();
});

// ---------------------------------------------------------------------------
// Signer / seed plumbing
// ---------------------------------------------------------------------------

function requireSigner(): NostrSigner {
  const signer = getAuth().signer;
  if (!signer) throw new Error("Not signed in");
  return signer;
}

function requireSeed(): { seed: string; orgSk: Uint8Array; orgPubkey: string } {
  const orgPubkey = state.orgPubkey;
  if (!orgPubkey) throw new Error("No active org");
  if (!store.seed) throw new Error("Treasury is locked — unlock the org seed first");
  const keys = orgNostrKeys(store.seed);
  if (keys.pubkey !== orgPubkey) throw new Error("Unlocked seed does not match this org");
  return { seed: store.seed, orgSk: keys.secretKey, orgPubkey };
}

function signAsMe(template: EventTemplate): Promise<VerifiedEvent> {
  const signer = requireSigner();
  return signer.signEvent(template);
}

/**
 * When a config change alters the vault signer set or threshold, the previous
 * vault address is recorded so its balance stays recoverable (swept into the
 * new vault with old-threshold co-signatures).
 */
function retiredFrom(prev: OrgConfig | undefined, next: OrgConfig): RetiredVault[] {
  const carried = prev?.retiredVaults ?? [];
  if (!prev) return carried;
  const key = (c: OrgConfig) => `${c.threshold}|${[...c.vaultSigners].sort().join(",")}`;
  if (key(prev) === key(next)) return carried;
  try {
    const oldVault = buildVault(prev.threshold, prev.vaultSigners);
    return [
      ...carried.filter((r) => r.address !== oldVault.address),
      {
        threshold: prev.threshold,
        signers: prev.vaultSigners,
        address: oldVault.address,
        scriptHex: oldVault.scriptHex,
        retiredAt: now(),
      },
    ];
  } catch {
    return carried;
  }
}

/**
 * Publish the org config. The `p` tags are intentional: they let any member
 * discover the orgs they belong to with a relay query on their own pubkey.
 * `prev` (the config being replaced) lets us record retired vault addresses.
 */
async function publishOrgConfig(
  config: OrgConfig,
  orgSk: Uint8Array,
  addr: string,
  prev?: OrgConfig,
): Promise<void> {
  const payload: OrgConfig = { ...config, retiredVaults: retiredFrom(prev, config) };
  const event = finalizeEvent(
    {
      kind: Kind.OrgConfig,
      created_at: now(),
      tags: [
        ["d", ORG_ID],
        ["a", addr],
        ["name", payload.name],
        ...payload.council.map((pubkey) => ["p", pubkey]),
      ],
      content: JSON.stringify(payload),
    },
    orgSk,
  );
  await publish(event);
  cacheOrgConfig(orgPubkeyFromAddress(addr), payload);
}

function orgPubkeyFromAddress(addr: string): string {
  return addr.split(":")[1] ?? "";
}

/** Governance rules are enforced here too, not only in the UI. */
function requireExecutableSpend(proposal: ProposalView): void {
  if (proposal.executed) throw new Error("This proposal has already been executed");
  if (!proposal.passed) throw new Error("The proposal has not passed yet");
  if (proposal.type !== "payment" || !proposal.onchainAddress || !proposal.amountSats) {
    throw new Error("This proposal has no vault payment details");
  }
}

async function requireVaultSigner(): Promise<void> {
  const config = state.config;
  if (!config) throw new Error("Org config not loaded yet");
  const xOnly = await myVaultXOnly();
  if (!config.vaultSigners.includes(xOnly)) {
    throw new Error("Your vault signer key is not part of this org's vault");
  }
}

/** Only council members hold the org key and may manage the org wallet. */
function requireAdmin(): void {
  if (state.myRole !== "admin") {
    throw new Error("Only organization administrators can do this");
  }
}

/** Members (including admins) may propose and vote, but not manage the org. */
function requireMember(): void {
  if (state.myRole !== "admin" && state.myRole !== "member") {
    throw new Error("Join the organization to do this");
  }
}

/** True for council members: the only identities allowed to manage the org wallet. */
export function isOrgAdmin(): boolean {
  return state.myRole === "admin";
}

/** True once the signed-in identity belongs to the active org. */
export function hasOrgAccess(): boolean {
  return state.myRole === "admin" || state.myRole === "member";
}

/** Permission defaults preserve the pre-permissions behavior. */
function effectivePermissions(): OrgPermissions {
  return {
    feedPost: state.config?.permissions?.feedPost ?? "admins",
    createProposal: state.config?.permissions?.createProposal ?? "members",
  };
}

/** May the signed-in role publish to the org feed? */
export function canPublishFeed(): boolean {
  if (state.myRole === "admin") return true;
  if (state.myRole !== "member") return false;
  return effectivePermissions().feedPost === "members";
}

/** May the signed-in role create proposals? */
export function canCreateProposal(): boolean {
  if (state.myRole === "admin") return true;
  if (state.myRole !== "member") return false;
  return effectivePermissions().createProposal === "members";
}

/**
 * Vault signer secret for the current member. Derived from the local nostr
 * secret when available (passkey/nsec); for NIP-07 a random key is generated
 * once and stored NIP-44-encrypted to self. The store key is member-scoped
 * (not org-scoped) so the same signer key carries across treasury rotation.
 */
async function getVaultSignerSecret(orgPubkeyOverride?: string): Promise<Uint8Array> {
  const signer = requireSigner();
  // Org creation needs a signer key before the new org becomes active.
  const orgPubkey = orgPubkeyOverride ?? state.orgPubkey;
  if (!orgPubkey) throw new Error("No active org");
  if (signer.secretKey) return vaultSignerKeys(signer.secretKey).secretKey;
  // NIP-07 path
  const storeKey = "bitmoot.vaultsigner.self";
  const existing = localStorage.getItem(storeKey);
  if (existing) return hexToBytes(await signer.nip44DecryptFrom(signer.pubkey, existing));
  // Older versions stored the key per-org; reuse it when present.
  for (let i = 0; i < localStorage.length; i++) {
    const legacyKey = localStorage.key(i);
    if (legacyKey && legacyKey.startsWith("bitmoot.vaultsigner.")) {
      const legacy = localStorage.getItem(legacyKey);
      if (!legacy) continue;
      try {
        const secret = hexToBytes(await signer.nip44DecryptFrom(signer.pubkey, legacy));
        localStorage.setItem(storeKey, legacy);
        return secret;
      } catch {
        /* try next */
      }
    }
  }
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  const encrypted = await signer.nip44EncryptTo(signer.pubkey, toHex(secret));
  localStorage.setItem(storeKey, encrypted);
  return secret;
}

export async function myVaultXOnly(): Promise<string> {
  const secret = await getVaultSignerSecret();
  return vaultXOnlyFromSecret(secret);
}

export interface VaultSignatureView {
  /** BIP-340 x-only key in the vault's signer set. */
  signerXOnly: string;
  /** Nostr pubkey that published this signer key, when known. */
  author: string | null;
  signed: boolean;
  createdAt: number | null;
  /** Number of valid taproot script-path signatures in the published PSBT. */
  sigs: number;
}

/**
 * Build the signature roster for a proposal: every configured vault signer,
 * whether it has published a PSBT contribution, and how many signatures that
 * contribution carries. This is the "list signatures" view of the multisig.
 */
export async function listVaultSignatures(proposalId: string): Promise<VaultSignatureView[]> {
  const orgPubkey = state.orgPubkey;
  const config = state.config;
  if (!orgPubkey || !config) return [];

  const [cosignEvents, signerEvents] = await Promise.all([
    query({ kinds: [Kind.PsbtCosign], "#e": [proposalId], limit: 200 }),
    query({ kinds: [Kind.VaultSigner], "#a": [orgAddress(orgPubkey)], limit: 500 }),
  ]);

  const signerByAuthor = new Map<string, string>();
  for (const event of signerEvents) {
    const xOnly = parseJsonContent<{ xOnly: string }>(event)?.xOnly;
    if (xOnly) signerByAuthor.set(event.pubkey, xOnly);
  }

  const contributionByAuthor = new Map<string, Event>();
  for (const event of cosignEvents) {
    if (!parseJsonContent<{ psbt: string }>(event)?.psbt) continue;
    const existing = contributionByAuthor.get(event.pubkey);
    if (!existing || existing.created_at < event.created_at) contributionByAuthor.set(event.pubkey, event);
  }

  const authorBySigner = new Map<string, string>();
  for (const [author, xOnly] of signerByAuthor) authorBySigner.set(xOnly, author);

  return config.vaultSigners.map((signerXOnly) => {
    const author = authorBySigner.get(signerXOnly) ?? null;
    const contribution = author ? contributionByAuthor.get(author) : undefined;
    let sigs = 0;
    if (contribution) {
      const psbt = parseJsonContent<{ psbt: string }>(contribution)?.psbt;
      if (psbt) {
        try {
          sigs = countTapScriptSigs(loadPsbt(psbt));
        } catch {
          sigs = 0;
        }
      }
    }
    return {
      signerXOnly,
      author,
      signed: sigs > 0,
      createdAt: contribution?.created_at ?? null,
      sigs,
    };
  });
}

// ---------------------------------------------------------------------------
// Governance review + payment authorization
// ---------------------------------------------------------------------------

export interface ProposalDebugDetails {
  proposalEvent: Event | null;
  voteEvents: Event[];
  cosignEvents: Event[];
  executionEvents: Event[];
  signerEvents: Event[];
  signatures: VaultSignatureView[];
  threshold: number;
  vaultAddress: string | null;
}

function uniqueEvents(events: Event[]): Event[] {
  const byId = new Map<string, Event>();
  for (const event of events) byId.set(event.id, event);
  return [...byId.values()].sort((a, b) => b.created_at - a.created_at);
}

function storedEvents(): Event[] {
  return [...store.byKindAuthorD.values(), ...store.events.values()];
}

/** Raw Nostr events behind a proposal, for the advanced review view. */
export async function getProposalDebugDetails(proposalId: string): Promise<ProposalDebugDetails> {
  const orgPubkey = state.orgPubkey;
  if (!orgPubkey) {
    return {
      proposalEvent: null,
      voteEvents: [],
      cosignEvents: [],
      executionEvents: [],
      signerEvents: [],
      signatures: [],
      threshold: 0,
      vaultAddress: null,
    };
  }

  const [proposalResults, voteResults, cosignResults, executionResults, signerResults, signatures] =
    await Promise.all([
      query({ ids: [proposalId], limit: 10 }),
      query({ kinds: [Kind.Vote], "#e": [proposalId], limit: 300 }),
      query({ kinds: [Kind.PsbtCosign], "#e": [proposalId], limit: 300 }),
      query({ kinds: [Kind.Execution], "#e": [proposalId], limit: 300 }),
      query({ kinds: [Kind.VaultSigner], "#a": [orgAddress(orgPubkey)], limit: 500 }),
      listVaultSignatures(proposalId),
    ]);

  const local = storedEvents();
  const proposalEvent =
    uniqueEvents([...local.filter((ev) => ev.id === proposalId), ...proposalResults])[0] ?? null;

  return {
    proposalEvent,
    voteEvents: uniqueEvents([
      ...local.filter((ev) => ev.kind === Kind.Vote && tagValue(ev, "e") === proposalId),
      ...voteResults,
    ]),
    cosignEvents: uniqueEvents([
      ...local.filter((ev) => ev.kind === Kind.PsbtCosign && tagValue(ev, "e") === proposalId),
      ...cosignResults,
    ]),
    executionEvents: uniqueEvents([
      ...local.filter((ev) => ev.kind === Kind.Execution && tagValue(ev, "e") === proposalId),
      ...executionResults,
    ]),
    signerEvents: uniqueEvents([
      ...local.filter((ev) => ev.kind === Kind.VaultSigner),
      ...signerResults,
    ]),
    signatures,
    threshold: state.config?.threshold ?? 0,
    vaultAddress: state.vault?.address ?? null,
  };
}

/** Resolve legacy on-chain proposals that predate the paymentMethod field. */
export function proposalPaymentMethod(proposal: ProposalView): PaymentMethod | null {
  if (proposal.paymentMethod) return proposal.paymentMethod;
  if (proposal.onchainAddress) return "onchain";
  return null;
}

/** Passed payment proposals are the only authorization to move org funds. */
export function approvedPaymentProposals(): ProposalView[] {
  return state.proposals.filter((p) => {
    if (p.type !== "payment" || !p.passed || p.executed) return false;
    if (!proposalPaymentMethod(p)) return false;
    return Boolean(p.payee ?? p.onchainAddress);
  });
}

/** A payment may only use the method, recipient, and amount the council approved. */
export function paymentMatchesProposal(
  proposal: ProposalView,
  payment: { recipient?: string; amount?: number },
): boolean {
  const expectedRecipient = (proposal.payee ?? proposal.onchainAddress)?.trim();
  if (expectedRecipient) {
    const recipient = payment.recipient?.trim();
    if (!recipient) return false;
    if (recipient.toLowerCase() !== expectedRecipient.toLowerCase()) return false;
  }

  // A BOLT-11 invoice commits to its own amount, so no separate amount check.
  if (proposalPaymentMethod(proposal) === "lightning") return true;

  const expectedAmount =
    proposalPaymentMethod(proposal) === "usdb" ? proposal.amountUsd : proposal.amountSats;
  if (expectedAmount == null) return true;
  const amount = payment.amount;
  if (amount == null || Number.isNaN(Number(amount))) return false;
  return Math.abs(Number(expectedAmount) - Number(amount)) < 0.000001;
}

export function requireApprovedPayment(
  method: PaymentMethod,
  recipient: string,
  amount?: number,
): ProposalView {
  const match = approvedPaymentProposals().find(
    (p) =>
      proposalPaymentMethod(p) === method && paymentMatchesProposal(p, { recipient, amount }),
  );
  if (!match) throw new Error("A passed payment proposal is required before moving funds");
  return match;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface CreateOrgOptions {
  name: string;
  description: string;
  threshold: number;
  councilNpubs: string[];
}

export interface CreatedOrg {
  orgNpub: string;
}

export async function createOrg(opts: CreateOrgOptions): Promise<CreatedOrg> {
  const signer = requireSigner();
  const seed = generateOrgSeed();
  const walletSeed = generateOrgSeed();
  const { secretKey: orgSk, pubkey: orgPubkey, npub: orgNpub } = orgNostrKeys(seed);
  const addr = orgAddress(orgPubkey);

  const council = [signer.pubkey];
  for (const npub of opts.councilNpubs) {
    const hex = npubToHex(npub);
    if (hex !== signer.pubkey) council.push(hex);
  }

  const mySecret = await getVaultSignerSecret(orgPubkey);
  const myXOnly = vaultXOnlyFromSecret(mySecret);

  const config: OrgConfig = {
    version: 1,
    name: opts.name,
    description: opts.description,
    threshold: Math.max(1, Math.min(opts.threshold, council.length)),
    council,
    vaultSigners: [myXOnly],
    createdAt: Math.floor(Date.now() / 1000),
  };

  const shareEvents: VerifiedEvent[] = [];
  for (const memberPubkey of council) {
    const payload = JSON.stringify({ mnemonic: seed, walletSeed });
    const conversationKey = nip44.getConversationKey(orgSk, memberPubkey);
    const encrypted = nip44.encrypt(payload, conversationKey);
    shareEvents.push(
      finalizeEvent(
        {
          kind: Kind.WalletShare,
          created_at: config.createdAt,
          tags: [
            ["d", `${ORG_ID}:${memberPubkey}`],
            ["a", addr],
            ["p", memberPubkey],
          ],
          content: encrypted,
        },
        orgSk,
      ),
    );
  }

  const signerEvent = await signAsMe({
    kind: Kind.VaultSigner,
    created_at: config.createdAt,
    tags: [["d", ORG_ID], ["a", addr]],
    content: JSON.stringify({ xOnly: myXOnly }),
  });

  await publishOrgConfig(config, orgSk, addr);
  await Promise.allSettled(shareEvents.map((ev) => publish(ev)));
  await publish(signerEvent);

  setSettings({ activeOrgNpub: orgNpub });
  store.seed = seed;
  store.walletSeed = walletSeed;
  ensureSubscribed();
  // The seeds never leave this module in plain text: they were encrypted into
  // a share for each admin above and stay in memory only for signing.
  return { orgNpub };
}

export async function joinOrg(note: string, orgNpub?: string): Promise<void> {
  if (orgNpub) {
    npubToHex(orgNpub); // validate before pointing the workspace at it
    setSettings({ activeOrgNpub: orgNpub.trim() });
  }
  const orgPubkey = state.orgPubkey;
  if (!orgPubkey) throw new Error("Enter an org npub first");
  const addr = orgAddress(orgPubkey);
  const mySecret = await getVaultSignerSecret();
  const myXOnly = vaultXOnlyFromSecret(mySecret);

  const vaultEvent = await signAsMe({
    kind: Kind.VaultSigner,
    created_at: now(),
    tags: [["d", ORG_ID], ["a", addr]],
    content: JSON.stringify({ xOnly: myXOnly }),
  });
  const joinEvent = await signAsMe({
    kind: Kind.JoinRequest,
    created_at: now(),
    tags: [["d", ORG_ID], ["a", addr], ["p", orgPubkey]],
    content: JSON.stringify({ note }),
  });
  await publish(vaultEvent);
  await publish(joinEvent);
}

/** Decrypt this member's wallet share in memory to sign; the seeds are never returned. */
export async function unlockTreasury(): Promise<void> {
  const orgPubkey = state.orgPubkey;
  if (!orgPubkey) throw new Error("No active org");
  requireAdmin();
  const signer = requireSigner();

  const events = await query({
    kinds: [Kind.WalletShare],
    authors: [orgPubkey],
    "#p": [signer.pubkey],
  });
  // newest first
  events.sort((a, b) => b.created_at - a.created_at);
  for (const ev of events) {
    try {
      const json = JSON.parse(await signer.nip44DecryptFrom(orgPubkey, ev.content)) as {
        mnemonic?: string;
        walletSeed?: string;
      };
      if (!json.mnemonic) continue;
      const keys = orgNostrKeys(json.mnemonic);
      if (keys.pubkey !== orgPubkey) continue; // wrong org
      store.seed = json.mnemonic;
      store.walletSeed = json.walletSeed ?? json.mnemonic; // legacy shares predate the split
      rebuild();
      return;
    } catch {
      /* try next share */
    }
  }
  throw new Error("No wallet share found for your key on this org");
}

export function lockTreasury() {
  store.seed = null;
  store.walletSeed = null;
  disconnectOrgWallet();
  rebuild();
}

/** The org seed is exposed only to administrators; members get read-only views. */
export function treasurySeed(): string | null {
  return state.myRole === "admin" ? store.seed : null;
}

/**
 * The Spark wallet seed — deliberately separate from the org identity seed so
 * the wallet can be rotated without changing the org's npub or history.
 * Legacy shares (pre-decoupling) fall back to the org seed.
 */
export function orgWalletSeed(): string | null {
  return state.myRole === "admin" ? store.walletSeed ?? store.seed : null;
}

/** The active org's hex pubkey, for wallet connection outside React. */
export function getActiveOrgPubkey(): string | null {
  return state.orgPubkey;
}

// ---------------------------------------------------------------------------
// Two-tier treasury: operational (Spark) vs reserve (L1 multisig)
// ---------------------------------------------------------------------------

/** True when a hot-wallet payment is above the operational cap and must instead be settled from the reserve vault. */
export function exceedsOperationalCap(amountSats: number | null | undefined): boolean {
  const cap = state.config?.hotCapSats;
  if (cap == null || cap <= 0) return false;
  return amountSats != null && amountSats > cap;
}

/**
 * Set the operational cap — the sats kept spendable in the hot Spark wallet.
 * Signed with the org key, so it needs an unlocked treasury.
 */
export async function updateTreasuryPolicy(hotCapSats: number): Promise<void> {
  requireAdmin();
  const { orgSk, orgPubkey } = requireSeed();
  const config = state.config;
  if (!config) throw new Error("Org config not loaded yet");
  if (!Number.isFinite(hotCapSats) || hotCapSats < 0) throw new Error("Invalid operational cap");
  const updated: OrgConfig = { ...config, hotCapSats: Math.floor(hotCapSats) };
  await publishOrgConfig(updated, orgSk, orgAddress(orgPubkey), config);
}

/**
 * Move Spark balance above the operational cap into the reserve vault. Funds
 * only become harder to steal by this move, so it needs no proposal: it is a
 * cooperative Spark→L1 exit paying the multisig vault address.
 */
export async function sweepExcessToVault(): Promise<{ sweptSats: number; reference: string } | null> {
  requireAdmin();
  const orgPubkey = state.orgPubkey!;
  const walletSeed = orgWalletSeed();
  if (!walletSeed) throw new Error("Treasury is locked — unlock the org seed first");
  const vault = state.vault;
  const cap = state.config?.hotCapSats;
  if (!vault) throw new Error("Reserve vault is not ready");
  if (cap == null) throw new Error("Set the operational cap first");
  const wallet = await connectOrgWallet(orgPubkey, walletSeed);
  const balances = await getOrgBalances(wallet);
  const excess = balances.sats - BigInt(cap);
  if (excess <= 0n) return null;
  const reference = await withdrawOnchain(wallet, vault.address, Number(excess));
  return { sweptSats: Number(excess), reference };
}

export interface WalletRotationResult {
  sweptSats: number;
  sweptUsdb: number;
  sweepErrors: string[];
}

/**
 * Rotate the Spark wallet seed WITHOUT touching the org identity: the npub,
 * proposals, feed posts and all history stay exactly as they are.
 *
 * Generates a fresh wallet seed, re-publishes every admin's share with it
 * (same org key, replaceable per-member events), and evacuates the old
 * Spark wallet into the new one. A leaked old seed share afterwards only
 * controls the old, emptied wallet — the identity keeps its records.
 */
export async function rotateWalletSeed(): Promise<WalletRotationResult> {
  requireAdmin();
  const { seed, orgSk, orgPubkey } = requireSeed();
  const config = state.config;
  if (!config) throw new Error("Org config not loaded yet");
  const addr = orgAddress(orgPubkey);

  const newWalletSeed = generateOrgSeed();

  // Re-publish every admin's share with the new wallet seed (latest wins by d-tag).
  const payload = JSON.stringify({ mnemonic: seed, walletSeed: newWalletSeed });
  const shareEvents: VerifiedEvent[] = config.council.map((member) =>
    finalizeEvent(
      {
        kind: Kind.WalletShare,
        created_at: now(),
        tags: [["d", `${ORG_ID}:${member}`], ["a", addr], ["p", member]],
        content: nip44.encrypt(payload, nip44.getConversationKey(orgSk, member)),
      },
      orgSk,
    ),
  );
  await Promise.allSettled(shareEvents.map((ev) => publish(ev)));

  // Evacuate the old Spark wallet into the new one (Spark → Spark).
  const sweepErrors: string[] = [];
  let sweptSats = 0;
  let sweptUsdb = 0;
  try {
    const oldWallet = await connectOrgWallet(orgPubkey, store.walletSeed ?? seed);
    const balances = await getOrgBalances(oldWallet);
    if (balances.sats > 0n || balances.usdb > 0n) {
      const newWallet = await connectOrgWallet(orgPubkey, newWalletSeed);
      const sparkAddress = await getOrgSparkAddress(newWallet);
      if (balances.sats > 0n) {
        try {
          await sendSatsToSparkAddress(oldWallet, sparkAddress, Number(balances.sats));
          sweptSats = Number(balances.sats);
        } catch (e) {
          sweepErrors.push(`sats: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (balances.usdb > 0n) {
        try {
          await sendUsdb(oldWallet, sparkAddress, Number(balances.usdb) / 10 ** USDB_DECIMALS);
          sweptUsdb = Number(balances.usdb);
        } catch (e) {
          sweepErrors.push(`USDB: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  } catch (e) {
    sweepErrors.push(e instanceof Error ? e.message : String(e));
  }

  store.walletSeed = newWalletSeed;
  rebuild();
  return { sweptSats, sweptUsdb, sweepErrors };
}

/** Approve a join request: send them a seed share and extend the council + vault. */
export async function approveMember(memberPubkey: string): Promise<void> {
  return addMemberInternal(memberPubkey);
}

/** Add a member directly by npub, optionally with their vault signer key provided out-of-band. */
export async function addMemberByNpub(npub: string, vaultXOnly?: string): Promise<void> {
  return addMemberInternal(npubToHex(npub.trim()), vaultXOnly);
}

/**
 * Add an x-only vault signer key to the vault config — for members who hand
 * you their key out-of-band instead of publishing it themselves. Signer keys
 * are public, so pasting them is safe; the threshold still guards spends.
 */
export async function addVaultSignerKey(xOnly: string): Promise<void> {
  requireAdmin();
  const { orgSk, orgPubkey } = requireSeed();
  const config = state.config;
  if (!config) throw new Error("Org config not loaded yet");
  const key = xOnly.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(key)) {
    throw new Error("Vault signer keys are 64 hex characters (x-only, no 02/03 prefix)");
  }
  if (config.vaultSigners.includes(key)) throw new Error("This signer key is already in the vault");
  const updated: OrgConfig = { ...config, vaultSigners: [...config.vaultSigners, key] };
  await publishOrgConfig(updated, orgSk, orgAddress(orgPubkey));
}

/**
 * Extend the council with a new member, publish the updated config, and send
 * them their encrypted seed share. Their vault signer key is pulled in when
 * already published (or provided directly); otherwise `syncVaultSigners` or
 * the manual "add signer key" action adds it once available.
 */
async function addMemberInternal(memberPubkey: string, providedXOnly?: string): Promise<void> {
  requireAdmin();
  const { seed, orgSk, orgPubkey } = requireSeed();
  const config = state.config;
  if (!config) throw new Error("Org config not loaded yet");
  const addr = orgAddress(orgPubkey);
  if (config.council.includes(memberPubkey)) throw new Error("Already a member");

  const council = [...config.council, memberPubkey];
  const vaultSigners = [...config.vaultSigners];

  const provided = providedXOnly?.trim().toLowerCase();
  if (provided) {
    if (!/^[0-9a-f]{64}$/.test(provided)) {
      throw new Error("Vault signer keys are 64 hex characters (x-only, no 02/03 prefix)");
    }
    if (!vaultSigners.includes(provided)) vaultSigners.push(provided);
  } else {
    // Pull the member's published vault key when it exists.
    const signerEvents = await query({
      kinds: [Kind.VaultSigner],
      authors: [memberPubkey],
      "#d": [ORG_ID],
    });
    const latestSigner = signerEvents.sort((a, b) => b.created_at - a.created_at)[0];
    const xOnly = latestSigner ? parseJsonContent<{ xOnly: string }>(latestSigner)?.xOnly : null;
    if (xOnly && !vaultSigners.includes(xOnly)) vaultSigners.push(xOnly);
  }

  const updated: OrgConfig = { ...config, council, vaultSigners };

  const payload = JSON.stringify({ mnemonic: seed });
  const encrypted = nip44.encrypt(payload, nip44.getConversationKey(orgSk, memberPubkey));
  const shareEvent = finalizeEvent(
    {
      kind: Kind.WalletShare,
      created_at: now(),
      tags: [["d", `${ORG_ID}:${memberPubkey}`], ["a", addr], ["p", memberPubkey]],
      content: encrypted,
    },
    orgSk,
  );

  await publishOrgConfig(updated, orgSk, addr, config);
  await publish(shareEvent);
}

/** Re-sync config vault signers from published vault keys (explicit, safe). */
export async function syncVaultSigners(): Promise<void> {
  requireAdmin();
  const { orgSk, orgPubkey } = requireSeed();
  const config = state.config;
  if (!config) throw new Error("Org config not loaded yet");
  const addr = orgAddress(orgPubkey);

  const vaultSigners = new Set(config.vaultSigners);
  const signerEvents = await query({
    kinds: [Kind.VaultSigner],
    authors: config.council,
    "#d": [ORG_ID],
  });
  for (const ev of signerEvents) {
    const xOnly = parseJsonContent<{ xOnly: string }>(ev)?.xOnly;
    if (xOnly) vaultSigners.add(xOnly);
  }

  const updated: OrgConfig = { ...config, vaultSigners: [...vaultSigners] };
  await publishOrgConfig(updated, orgSk, addr, config);
}

export async function publishVaultSigner(): Promise<void> {
  const orgPubkey = state.orgPubkey;
  if (!orgPubkey) throw new Error("No active org");
  requireMember();
  const mySecret = await getVaultSignerSecret();
  const myXOnly = vaultXOnlyFromSecret(mySecret);
  const ev = await signAsMe({
    kind: Kind.VaultSigner,
    created_at: now(),
    tags: [["d", ORG_ID], ["a", orgAddress(orgPubkey)]],
    content: JSON.stringify({ xOnly: myXOnly }),
  });
  await publish(ev);
}

/** Who may perform a content action. */
export type ContentPermission = "admins" | "members";

export interface OrgPermissions {
  /** Publishing to the org feed (kind 1). Default "admins". */
  feedPost: ContentPermission;
  /** Creating proposals (kind 37000). Default "members". */
  createProposal: ContentPermission;
}

/** A governance change to the org configuration, applied after its proposal passes. */
export interface ConfigChangeInput {
  action: "setThreshold" | "addSigner" | "removeSigner" | "addMember" | "removeMember" | "setPermissions";
  /** setThreshold: the new M value. */
  threshold?: number;
  /** addSigner / removeSigner: the x-only key. */
  xOnly?: string;
  /** addMember / removeMember */
  memberNpub?: string;
  /** addMember: optional out-of-band vault signer key. */
  memberXOnly?: string;
  /** removeMember: an extra vault key to strip (e.g. one added out-of-band for them). */
  removeXOnly?: string;
  /** setPermissions: partial permission update. */
  permissions?: Partial<OrgPermissions>;
}

export interface ProposalInput {
  title: string;
  body: string;
  type: "payment" | "general" | "config";
  paymentMethod?: PaymentMethod;
  payee?: string;
  amountSats?: number;
  amountUsd?: number;
  onchainAddress?: string;
  configChange?: ConfigChangeInput;
}

const X_ONLY_KEY_RE = /^[0-9a-f]{64}$/;

/** Human-readable summary of a config change (lists, toasts, titles). */
export function configChangeSummary(change: ConfigChangeInput): string {
  if (change.action === "setThreshold") return `Change vault threshold to ${change.threshold}-of-N`;
  if (change.action === "addSigner") return `Add vault signer ${change.xOnly?.slice(0, 10) ?? ""}…`;
  if (change.action === "removeSigner") return `Remove vault signer ${change.xOnly?.slice(0, 10) ?? ""}…`;
  if (change.action === "removeMember") return `Remove member ${shortNpub(change.memberNpub ?? "")}`;
  if (change.action === "setPermissions") {
    const parts: string[] = [];
    if (change.permissions?.feedPost) parts.push(`feed posting → ${change.permissions.feedPost}`);
    if (change.permissions?.createProposal) parts.push(`proposals → ${change.permissions.createProposal}`);
    return `Update permissions: ${parts.join(", ") || "no change"}`;
  }
  return `Add member ${change.memberNpub?.slice(0, 16) ?? ""}…`;
}

function configChangeTitle(change: ConfigChangeInput): string {
  if (change.action === "setThreshold") return `Change vault threshold to ${change.threshold}`;
  if (change.action === "addSigner") return `Add vault signer ${change.xOnly?.slice(0, 12) ?? ""}…`;
  if (change.action === "removeSigner") return `Remove vault signer ${change.xOnly?.slice(0, 12) ?? ""}…`;
  if (change.action === "removeMember") return `Remove member ${shortNpub(change.memberNpub ?? "")}`;
  if (change.action === "setPermissions") return "Update content permissions";
  return `Add member ${shortNpub(change.memberNpub ?? "")}`;
}

/** Validate a config change against the CURRENT config (proposal time and execution time). */
function validateConfigChange(change: ConfigChangeInput): void {
  const config = state.config;
  if (!config) throw new Error("Org config not loaded yet");
  if (change.action === "setThreshold") {
    const t = change.threshold;
    if (t == null || !Number.isInteger(t) || t < 1) {
      throw new Error("The threshold must be a positive whole number");
    }
    if (t > config.vaultSigners.length) {
      throw new Error(`Threshold cannot exceed the ${config.vaultSigners.length} published signer keys`);
    }
    if (t === config.threshold) throw new Error(`The threshold is already ${t}`);
  } else if (change.action === "addSigner") {
    const key = change.xOnly?.trim().toLowerCase();
    if (!key || !X_ONLY_KEY_RE.test(key)) {
      throw new Error("Vault signer keys are 64 hex characters (x-only, no 02/03 prefix)");
    }
    if (config.vaultSigners.includes(key)) throw new Error("This signer key is already in the vault");
  } else if (change.action === "removeSigner") {
    const key = change.xOnly?.trim().toLowerCase();
    if (!key || !X_ONLY_KEY_RE.test(key)) {
      throw new Error("Vault signer keys are 64 hex characters (x-only, no 02/03 prefix)");
    }
    if (!config.vaultSigners.includes(key)) throw new Error("This signer key is not in the vault");
    if (config.vaultSigners.length - 1 < config.threshold) {
      throw new Error(`Removing this signer would leave fewer keys than the ${config.threshold}-of-N threshold`);
    }
  } else if (change.action === "addMember") {
    if (!change.memberNpub?.trim().startsWith("npub1")) {
      throw new Error("Enter an npub (starts with npub1)");
    }
    const hex = npubToHex(change.memberNpub.trim());
    if (config.council.includes(hex)) throw new Error("This member is already in the organization");
    const provided = change.memberXOnly?.trim().toLowerCase();
    if (provided && !X_ONLY_KEY_RE.test(provided)) {
      throw new Error("Vault signer keys are 64 hex characters (x-only, no 02/03 prefix)");
    }
  } else if (change.action === "removeMember") {
    if (!change.memberNpub?.trim().startsWith("npub1")) {
      throw new Error("Enter an npub (starts with npub1)");
    }
    const hex = npubToHex(change.memberNpub.trim());
    if (!config.council.includes(hex)) throw new Error("This member is not part of the organization");
    if (config.council.length - 1 < 1) throw new Error("The organization needs at least one member");
    // Count how many vault keys leave with them (their published key + any
    // explicitly stripped out-of-band key) and keep the vault spendable.
    const theirKey = state.members.find((m) => m.pubkey === hex)?.vaultXOnly?.toLowerCase();
    const extra = change.removeXOnly?.trim().toLowerCase();
    const leaving = new Set([theirKey, extra].filter((k): k is string => Boolean(k)));
    const remaining = config.vaultSigners.filter((k) => !leaving.has(k)).length;
    if (remaining < config.threshold) {
      throw new Error(`Removing this member would leave fewer vault signers than the ${config.threshold}-of-N threshold`);
    }
  } else if (change.action === "setPermissions") {
    const p = change.permissions ?? {};
    if (!p.feedPost && !p.createProposal) throw new Error("Choose at least one permission to change");
    for (const value of [p.feedPost, p.createProposal]) {
      if (value && value !== "admins" && value !== "members") {
        throw new Error("Permissions must be either \"admins\" or \"members\"");
      }
    }
    const current = effectivePermissions();
    if (
      (p.feedPost == null || p.feedPost === current.feedPost) &&
      (p.createProposal == null || p.createProposal === current.createProposal)
    ) {
      throw new Error("These permissions are already in effect");
    }
  } else {
    throw new Error("Unknown config change");
  }
}

/**
 * Propose a configuration change as a voted proposal. It applies automatically
 * once it gathers the current threshold of yes votes (an administrator must
 * have the treasury unlocked so the org key can sign the new config).
 */
export async function proposeConfigChange(change: ConfigChangeInput, title?: string): Promise<void> {
  validateConfigChange(change);
  await createProposal({
    type: "config",
    title: title ?? configChangeTitle(change),
    body: configChangeSummary(change),
    configChange: change,
  });
}

/** True when a passed config proposal can still be applied to the current config. */
export function canExecuteConfigChange(proposal: ProposalView): boolean {
  if (proposal.type !== "config" || !proposal.passed || proposal.executed || !proposal.configChange) {
    return false;
  }
  const config = state.config;
  if (!config) return false;
  const change = proposal.configChange;
  if (change.action === "setThreshold") {
    return (
      change.threshold != null &&
      Number.isInteger(change.threshold) &&
      change.threshold >= 1 &&
      change.threshold <= config.vaultSigners.length &&
      change.threshold !== config.threshold
    );
  }
  if (change.action === "addSigner") {
    const key = change.xOnly?.trim().toLowerCase();
    return Boolean(key && X_ONLY_KEY_RE.test(key) && !config.vaultSigners.includes(key));
  }
  if (change.action === "removeSigner") {
    const key = change.xOnly?.trim().toLowerCase();
    return Boolean(
      key && config.vaultSigners.includes(key) && config.vaultSigners.length - 1 >= config.threshold,
    );
  }
  if (change.action === "addMember") {
    try {
      const hex = change.memberNpub ? npubToHex(change.memberNpub.trim()) : "";
      return Boolean(hex) && !config.council.includes(hex);
    } catch {
      return false;
    }
  }
  if (change.action === "removeMember") {
    try {
      const hex = change.memberNpub ? npubToHex(change.memberNpub.trim()) : "";
      if (!hex || !config.council.includes(hex)) return false;
      if (config.council.length - 1 < 1) return false;
      const theirKey = state.members.find((m) => m.pubkey === hex)?.vaultXOnly?.toLowerCase();
      const extra = change.removeXOnly?.trim().toLowerCase();
      const leaving = new Set([theirKey, extra].filter((k): k is string => Boolean(k)));
      return config.vaultSigners.filter((k) => !leaving.has(k)).length >= config.threshold;
    } catch {
      return false;
    }
  }
  if (change.action === "setPermissions") {
    const p = change.permissions ?? {};
    if (!p.feedPost && !p.createProposal) return false;
    const current = effectivePermissions();
    const feedChanged = p.feedPost != null && p.feedPost !== current.feedPost;
    const proposalChanged = p.createProposal != null && p.createProposal !== current.createProposal;
    return feedChanged || proposalChanged;
  }
  return false;
}

/**
 * Apply a passed config proposal: publish the new config with the org key
 * (and the member's seed share for addMember), then record the execution so
 * the change can never be applied twice.
 */
export async function executeConfigChange(proposal: ProposalView): Promise<string> {
  requireAdmin();
  const { orgSk, orgPubkey } = requireSeed();
  const config = state.config;
  if (!config) throw new Error("Org config not loaded yet");
  if (proposal.type !== "config" || !proposal.passed) throw new Error("This proposal has not passed");
  const change = proposal.configChange;
  if (!change) throw new Error("This proposal carries no config change");
  validateConfigChange(change); // re-checked against the CURRENT config

  const addr = orgAddress(orgPubkey);
  if (change.action === "addMember") {
    await addMemberInternal(
      npubToHex(change.memberNpub!.trim()),
      change.memberXOnly?.trim().toLowerCase() || undefined,
    );
  } else if (change.action === "addSigner") {
    const key = change.xOnly!.trim().toLowerCase();
    const updated: OrgConfig = { ...config, vaultSigners: [...config.vaultSigners, key] };
    await publishOrgConfig(updated, orgSk, addr, config);
  } else if (change.action === "removeSigner") {
    const key = change.xOnly!.trim().toLowerCase();
    const updated: OrgConfig = {
      ...config,
      vaultSigners: config.vaultSigners.filter((k) => k !== key),
    };
    await publishOrgConfig(updated, orgSk, addr, config);
  } else if (change.action === "removeMember") {
    const hex = npubToHex(change.memberNpub!.trim());
    // Strip their published vault key (if any) plus any explicitly named
    // out-of-band key, so a removed member keeps no vault spend authority.
    const theirKey = state.members.find((m) => m.pubkey === hex)?.vaultXOnly?.toLowerCase();
    const extra = change.removeXOnly?.trim().toLowerCase();
    const leaving = new Set([theirKey, extra].filter((k): k is string => Boolean(k)));
    const updated: OrgConfig = {
      ...config,
      council: config.council.filter((p) => p !== hex),
      vaultSigners: config.vaultSigners.filter((k) => !leaving.has(k)),
    };
    await publishOrgConfig(updated, orgSk, addr, config);
  } else if (change.action === "setPermissions") {
    const updated: OrgConfig = {
      ...config,
      permissions: {
        ...effectivePermissions(),
        ...change.permissions,
      },
    };
    await publishOrgConfig(updated, orgSk, addr, config);
  } else {
    const updated: OrgConfig = { ...config, threshold: change.threshold! };
    await publishOrgConfig(updated, orgSk, addr, config);
  }

  const ev = await signAsMe({
    kind: Kind.Execution,
    created_at: now(),
    tags: [["d", proposal.id], ["a", addr], ["e", proposal.id]],
    content: JSON.stringify({ txid: `config:${change.action}`, proposalId: proposal.id, method: "config" }),
  });
  await publish(ev);
  ingest(ev);
  return configChangeSummary(change);
}

export async function createProposal(input: ProposalInput): Promise<void> {
  const orgPubkey = state.orgPubkey;
  if (!orgPubkey) throw new Error("No active org");
  requireMember();
  if (!canCreateProposal()) {
    throw new Error("Creating proposals is restricted to administrators");
  }
  const encrypted = await encryptedGovernancePayload(input);
  const ev = await signAsMe({
    kind: Kind.Proposal,
    created_at: now(),
    tags: [
      ["d", crypto.randomUUID()],
      ["a", orgAddress(orgPubkey)],
      ["encrypted", "nip44"],
      ...encrypted.recipients.map((pubkey) => ["p", pubkey]),
    ],
    content: encrypted.content,
  });
  await publish(ev);
}

export async function castVote(proposalId: string, choice: VoteChoice): Promise<void> {
  const orgPubkey = state.orgPubkey;
  if (!orgPubkey) throw new Error("No active org");
  requireMember();
  const encrypted = await encryptedGovernancePayload({ choice });
  const ev = await signAsMe({
    kind: Kind.Vote,
    created_at: now(),
    tags: [
      ["d", proposalId],
      ["a", orgAddress(orgPubkey)],
      ["e", proposalId],
      ["encrypted", "nip44"],
      ...encrypted.recipients.map((pubkey) => ["p", pubkey]),
    ],
    content: encrypted.content,
  });
  await publish(ev);
}

/**
 * Mark a Lightning/USDB/Spark payment as executed on Nostr so the same
 * approval cannot be spent twice. On-chain vault spends publish their own
 * execution event via `executeVaultSpend`.
 */
export async function recordPaymentExecution(
  proposal: ProposalView,
  paymentReference: string,
): Promise<void> {
  const orgPubkey = state.orgPubkey;
  if (!orgPubkey) throw new Error("No active org");
  requireAdmin();
  if (proposal.executed) throw new Error("This proposal has already been paid");
  if (!proposal.passed) throw new Error("The proposal has not passed yet");
  if (proposal.type !== "payment") throw new Error("This is not a payment proposal");

  const ev = await signAsMe({
    kind: Kind.Execution,
    created_at: now(),
    tags: [
      ["d", proposal.id],
      ["a", orgAddress(orgPubkey)],
      ["e", proposal.id],
    ],
    content: JSON.stringify({
      txid: paymentReference,
      paymentId: paymentReference,
      proposalId: proposal.id,
      method: proposalPaymentMethod(proposal),
    }),
  });
  await publish(ev);
  ingest(ev);
}

export async function publishFeedPost(text: string): Promise<void> {
  const orgPubkey = state.orgPubkey;
  if (!orgPubkey) throw new Error("No active org");
  if (!canPublishFeed()) {
    throw new Error("Posting to the org feed is restricted to administrators");
  }
  const ev = await signAsMe({
    kind: 1,
    created_at: now(),
    tags: [["a", orgAddress(orgPubkey)]],
    content: text,
  });
  await publish(ev);
}

// ---------------------------------------------------------------------------
// Vault spending flow
// ---------------------------------------------------------------------------

export interface VaultSpendResult {
  psbtBase64: string;
  fee: bigint;
  txid: string;
  utxosUsed: number;
}

/** Step 1: build a spend for a passed payment proposal and co-sign it. */
export async function createVaultSpend(
  proposal: ProposalView,
  opts?: { feeRate?: number; utxos?: Utxo[] },
): Promise<VaultSpendResult> {
  const vault = state.vault;
  if (!vault) throw new Error("Vault is not complete yet");
  requireAdmin();
  requireExecutableSpend(proposal);
  await requireVaultSigner();
  const feeRate = opts?.feeRate ?? (await fetchRecommendedFeeRate());
  const utxos = opts?.utxos ?? (await fetchUtxos(vault.address));
  if (!utxos.length) throw new Error("Vault has no UTXOs to spend");

  const built = buildVaultSpend({
    vault,
    utxos,
    recipientAddress: proposal.onchainAddress,
    amountSats: BigInt(proposal.amountSats),
    feeRate,
  });
  const signed = signPsbt(built.psbtBase64, await getVaultSignerSecret());

  const ev = await signAsMe({
    kind: Kind.PsbtCosign,
    created_at: now(),
    tags: [
      ["d", proposal.id],
      ["a", orgAddress(state.orgPubkey!)],
      ["e", proposal.id],
    ],
    content: JSON.stringify({ psbt: signed, txid: built.txid }),
  });
  await publish(ev);
  return { psbtBase64: signed, fee: built.fee, txid: built.txid, utxosUsed: utxos.length };
}

/** Step 2: co-sign an existing PSBT for a proposal. */
export async function cosignVaultSpend(proposal: ProposalView): Promise<void> {
  const orgPubkey = state.orgPubkey;
  if (!orgPubkey) throw new Error("No active org");
  requireAdmin();
  requireExecutableSpend(proposal);
  await requireVaultSigner();
  const vault = state.vault;
  if (!vault) throw new Error("Vault is not complete yet");
  const events = await query({
    kinds: [Kind.PsbtCosign],
    "#e": [proposal.id],
  });
  if (!events.length) throw new Error("No PSBT found for this proposal");
  // pick any existing contribution as the base PSBT (they share the unsigned tx)
  events.sort((a, b) => b.created_at - a.created_at);
  const base = parseJsonContent<{ psbt: string }>(events[0])?.psbt;
  if (!base) throw new Error("Invalid PSBT event");
  // Never sign blind: the PSBT must pay exactly what the proposal approved.
  verifyVaultSpendPsbt(base, {
    vault,
    recipientAddress: proposal.onchainAddress!,
    amountSats: BigInt(proposal.amountSats!),
  });
  const signed = signPsbt(base, await getVaultSignerSecret());
  const ev = await signAsMe({
    kind: Kind.PsbtCosign,
    created_at: now(),
    tags: [
      ["d", proposal.id],
      ["a", orgAddress(orgPubkey)],
      ["e", proposal.id],
    ],
    content: JSON.stringify({ psbt: signed }),
  });
  await publish(ev);
}

/**
 * Create, co-sign, or execute the migration of a retired vault's balance into
 * the current vault. Stage-aware and idempotent, like the proposal vault flow:
 * the first admin click builds and signs the sweep, further clicks co-sign,
 * and once the OLD threshold of signatures is collected the transaction is
 * broadcast. Every PSBT is verified to pay only the current vault address, so
 * a migration can never redirect funds out of multisig custody.
 */
export async function advanceVaultMigration(retiredAddress: string): Promise<string> {
  requireAdmin();
  const config = state.config;
  const currentVault = state.vault;
  if (!config || !currentVault) throw new Error("Current vault is not ready yet");
  const retired = (config.retiredVaults ?? []).find((r) => r.address === retiredAddress);
  if (!retired) throw new Error("Unknown retired vault");
  if (retired.address === currentVault.address) throw new Error("Already the current vault");
  const orgPubkey = state.orgPubkey!;
  const addr = orgAddress(orgPubkey);
  const migrationId = `migration:${retired.address}`;

  const executed = await query({ kinds: [Kind.Execution], "#e": [migrationId], limit: 1 });
  if (executed.length) throw new Error("This vault migration has already been broadcast");

  const oldVault = buildVault(retired.threshold, retired.signers);

  // Gather existing contributions, keep only valid ones, group by unsigned tx.
  const events = await query({ kinds: [Kind.PsbtCosign], "#e": [migrationId], limit: 200 });
  const groups = new Map<string, { psbt: string; sigs: number; createdAt: number }[]>();
  for (const ev of events) {
    const psbt = parseJsonContent<{ psbt: string }>(ev)?.psbt;
    if (!psbt) continue;
    try {
      verifyMigrationPsbt(psbt, oldVault, currentVault.address);
    } catch {
      continue; // ignore rogue or stale contributions
    }
    const tx = loadPsbt(psbt);
    const list = groups.get(tx.id) ?? [];
    list.push({ psbt, sigs: countTapScriptSigs(tx), createdAt: ev.created_at });
    groups.set(tx.id, list);
  }

  let bestTxid: string | null = null;
  let bestSigs = 0;
  for (const [txid, list] of groups) {
    const maxSigs = Math.max(...list.map((item) => item.sigs));
    if (maxSigs > bestSigs) {
      bestSigs = maxSigs;
      bestTxid = txid;
    }
  }

  if (!bestTxid) {
    // Stage 1: no migration PSBT yet — build the sweep and sign it.
    const utxos = await fetchUtxos(retired.address);
    if (!utxos.length) throw new Error("The retired vault has no funds to migrate");
    const built = buildVaultSpend({
      vault: oldVault,
      utxos,
      recipientAddress: currentVault.address,
      amountSats: 0n,
      feeRate: await fetchRecommendedFeeRate(),
      sweepAll: true,
    });
    const signed = signPsbt(built.psbtBase64, await getVaultSignerSecret());
    const ev = await signAsMe({
      kind: Kind.PsbtCosign,
      created_at: now(),
      tags: [["d", migrationId], ["a", addr], ["e", migrationId]],
      content: JSON.stringify({ psbt: signed, txid: built.txid, migration: retired.address }),
    });
    await publish(ev);
    ingest(ev);
    const sigs = countTapScriptSigs(loadPsbt(signed));
    if (sigs >= retired.threshold) return advanceVaultMigration(retiredAddress);
    return `Migration PSBT published — waiting for co-signatures (${sigs}/${retired.threshold})`;
  }

  const list = groups.get(bestTxid)!;
  const base = list.sort((a, b) => b.createdAt - a.createdAt)[0].psbt;

  // Stage 2: co-sign if this member hasn't contributed yet.
  if (bestSigs < retired.threshold) {
    const myXOnly = await myVaultXOnly();
    const mine = list.some((item) => psbtHasSigFrom(item.psbt, myXOnly));
    if (!mine) {
      const signed = signPsbt(base, await getVaultSignerSecret());
      const ev = await signAsMe({
        kind: Kind.PsbtCosign,
        created_at: now(),
        tags: [["d", migrationId], ["a", addr], ["e", migrationId]],
        content: JSON.stringify({ psbt: signed, txid: bestTxid, migration: retired.address }),
      });
      await publish(ev);
      ingest(ev);
      list.push({ psbt: signed, sigs: countTapScriptSigs(loadPsbt(signed)), createdAt: now() });
      bestSigs = Math.max(bestSigs, list[list.length - 1].sigs);
      if (bestSigs < retired.threshold) {
        return `Co-signature published — waiting for the rest (${bestSigs}/${retired.threshold})`;
      }
    }
  }

  // Stage 3: enough old-threshold signatures — combine, broadcast, record.
  const combined = combinePsbts(list.map((item) => item.psbt));
  const sigs = countTapScriptSigs(combined);
  if (sigs < retired.threshold) {
    return `Waiting for co-signatures (${sigs}/${retired.threshold})`;
  }
  const rawHex = finalizeAndExtract(combined);
  const txid = await broadcastTx(rawHex);
  const ev = await signAsMe({
    kind: Kind.Execution,
    created_at: now(),
    tags: [["d", migrationId], ["a", addr], ["e", migrationId]],
    content: JSON.stringify({ txid, migration: retired.address, method: "vault" }),
  });
  await publish(ev);
  ingest(ev);
  return `Migration broadcast · ${txid.slice(0, 16)}…`;
}

/** True when the PSBT already carries a taproot signature from this x-only key. */
function psbtHasSigFrom(psbtBase64: string, xOnly: string): boolean {
  const tx = loadPsbt(psbtBase64);
  for (let i = 0; i < tx.inputsLength; i++) {
    const sigs = tx.getInput(i).tapScriptSig ?? [];
    if (sigs.some((entry) => toHex(entry[0].pubKey) === xOnly)) return true;
  }
  return false;
}

/** Step 3: combine all collected signatures, broadcast, and record execution. */
export async function executeVaultSpend(proposal: ProposalView): Promise<string> {  const orgPubkey = state.orgPubkey;
  if (!orgPubkey) throw new Error("No active org");
  const config = state.config;
  const vault = state.vault;
  if (!config || !vault) throw new Error("Vault is not complete");
  requireAdmin();
  requireExecutableSpend(proposal);
  await requireVaultSigner();

  const events = await query({ kinds: [Kind.PsbtCosign], "#e": [proposal.id] });
  if (!events.length) throw new Error("No PSBTs found for this proposal");

  // latest per author
  const byAuthor = new Map<string, Event>();
  for (const ev of events) {
    const existing = byAuthor.get(ev.pubkey);
    if (!existing || existing.created_at < ev.created_at) byAuthor.set(ev.pubkey, ev);
  }

  // Every contribution must pay exactly what the proposal approved — a rogue
  // PSBT (e.g. redirecting funds to the initiator) is rejected, not combined.
  const expectation = {
    vault,
    recipientAddress: proposal.onchainAddress!,
    amountSats: BigInt(proposal.amountSats!),
  };
  const psbts: string[] = [];
  for (const [author, ev] of byAuthor) {
    const psbt = parseJsonContent<{ psbt: string }>(ev)?.psbt;
    if (!psbt) continue;
    try {
      verifyVaultSpendPsbt(psbt, expectation);
    } catch (error) {
      throw new Error(
        `Rejecting PSBT from ${shortNpub(author)}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    psbts.push(psbt);
  }
  if (!psbts.length) throw new Error("No valid PSBTs found for this proposal");

  const combined = combinePsbts(psbts);
  const sigs = countTapScriptSigs(combined);
  if (sigs < config.threshold) {
    throw new Error(`Only ${sigs}/${config.threshold} signatures collected`);
  }
  const rawHex = finalizeAndExtract(combined);
  const txid = await broadcastTx(rawHex);

  const ev = await signAsMe({
    kind: Kind.Execution,
    created_at: now(),
    tags: [
      ["d", proposal.id],
      ["a", orgAddress(orgPubkey)],
      ["e", proposal.id],
    ],
    content: JSON.stringify({ txid, proposalId: proposal.id }),
  });
  await publish(ev);
  return txid;
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}
