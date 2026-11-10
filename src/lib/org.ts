import { useSyncExternalStore } from "react";
import { finalizeEvent } from "nostr-tools/pure";
import { decode as nip19Decode, npubEncode } from "nostr-tools/nip19";
import * as nip44 from "nostr-tools/nip44";
import type { Event, EventTemplate, VerifiedEvent } from "nostr-tools";
import { Kind, publish, subscribe, query, orgAddressTag, parseJsonContent, tagValue, relays } from "./nostr";
import { getSettings, setSettings, subscribeSettings } from "./settings";
import { getAuth, type NostrSigner } from "./auth";
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
  fetchUtxos,
  fetchRecommendedFeeRate,
  broadcastTx,
  type VaultInfo,
  type Utxo,
} from "./vault";
import { disconnectOrgWallet } from "./spark";

/**
 * Org data layer. Everything an org publishes lives on Nostr under a single
 * addressable identity derived from the org wallet seed:
 *
 *   30078  OrgConfig   (org key, d=bitmoot)  — name, council, threshold, vault signers
 *   30079  WalletShare (org key → member)   — NIP-44 encrypted org seed
 *   30080  VaultSigner (member, d=bitmoot)   — member vault x-only pubkey
 *   30081  PsbtCosign  (member, d=proposal) — PSBT exchange for vault spends
 *   37000  Proposal    (member, d=uuid)
 *   30052  Vote        (member, d=proposal)  — replaceable: latest vote wins
 *   9705   Execution   (member, d=proposal)  — broadcast record
 *   9703   JoinRequest (joiner, d=bitmoot)   — ask to join, includes vault key
 *   1      Feed post   (member)              — tagged to the org
 */

/** The single org identifier: one org per org key. */
export const ORG_ID = "bitmoot";

export function orgAddress(orgPubkey: string): string {
  return orgAddressTag(orgPubkey, ORG_ID);
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
  createdAt: number;
}

export interface OrgMember {
  pubkey: string;
  npub: string;
  vaultXOnly: string | null;
  isCouncil: boolean;
  joinedAt?: number;
}

export type VoteChoice = "yes" | "no" | "abstain";

export interface ProposalView {
  id: string;
  author: string;
  createdAt: number;
  title: string;
  body: string;
  type: "payment" | "general";
  amountSats?: number;
  onchainAddress?: string;
  votes: { author: string; choice: VoteChoice; createdAt: number }[];
  yesCount: number;
  noCount: number;
  passed: boolean;
  executed: boolean;
  execution?: { txid: string; createdAt: number };
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
  vault: VaultInfo | null;
  vaultComplete: boolean;
  proposals: ProposalView[];
  feed: FeedPost[];
  joinRequests: JoinRequestView[];
  loading: boolean;
  seedUnlocked: boolean;
}

const EMPTY_STATE: OrgState = {
  orgPubkey: null,
  orgNpub: null,
  config: null,
  members: [],
  vault: null,
  vaultComplete: false,
  proposals: [],
  feed: [],
  joinRequests: [],
  loading: false,
  seedUnlocked: false,
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
  unsub: null as null | (() => void),
  subKey: "",
};

let state: OrgState = EMPTY_STATE;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribeStore(cb: () => void) {
  if (listeners.size === 0) ensureSubscribed();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) store.unsub?.();
  };
}

export function useOrg(): OrgState {
  return useSyncExternalStore(subscribeStore, () => state, () => state);
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
  rebuild();
}

/** (Re)build derived state from raw events. */
function rebuild() {
  const orgPubkey = state.orgPubkey;
  if (!orgPubkey) return;

  const configEv = latest(Kind.OrgConfig, orgPubkey, ORG_ID);
  const config = configEv ? parseJsonContent<OrgConfig>(configEv) : null;

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
    const content = parseJsonContent<{ choice: VoteChoice }>(ev);
    if (!content?.choice) continue;
    const map = votesByProposal.get(proposalId) ?? new Map();
    map.set(ev.pubkey, { author: ev.pubkey, choice: content.choice, createdAt: ev.created_at });
    votesByProposal.set(proposalId, map);
  }

  // executions by proposal
  const executions = new Map<string, { txid: string; createdAt: number }>();
  for (const ev of collectByKind(Kind.Execution)) {
    const proposalId = tagValue(ev, "e");
    const content = parseJsonContent<{ txid: string }>(ev);
    if (!proposalId || !content?.txid) continue;
    executions.set(proposalId, { txid: content.txid, createdAt: ev.created_at });
  }

  // psbt contribution counts per proposal (latest per author)
  const psbtCounts = new Map<string, number>();
  for (const ev of collectByKind(Kind.PsbtCosign)) {
    const proposalId = tagValue(ev, "e");
    if (!proposalId) continue;
    const content = parseJsonContent<{ psbt: string }>(ev);
    if (!content?.psbt) continue;
    psbtCounts.set(proposalId, (psbtCounts.get(proposalId) ?? 0) + 1);
  }

  // proposals
  const threshold = config?.threshold ?? Infinity;
  const councilSet = new Set(config?.council ?? []);
  const proposals: ProposalView[] = [];
  for (const ev of collectByKind(Kind.Proposal)) {
    const content = parseJsonContent<{
      title: string;
      body: string;
      type: string;
      amountSats?: number;
      onchainAddress?: string;
    }>(ev);
    if (!content) continue;
    const votes = votesByProposal.get(ev.id) ?? new Map();
    const voteList = [...votes.values()];
    const yesCount = voteList.filter((v) => v.choice === "yes" && councilSet.has(v.author)).length;
    const noCount = voteList.filter((v) => v.choice === "no" && councilSet.has(v.author)).length;
    const execution = executions.get(ev.id);
    proposals.push({
      id: ev.id,
      author: ev.pubkey,
      createdAt: ev.created_at,
      title: content.title,
      body: content.body,
      type: content.type === "payment" ? "payment" : "general",
      amountSats: content.amountSats,
      onchainAddress: content.onchainAddress,
      votes: voteList,
      yesCount,
      noCount,
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
    vault,
    vaultComplete,
    proposals,
    feed,
    joinRequests,
    loading: false,
    seedUnlocked: store.seed !== null,
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
 * Vault signer secret for the current member. Derived from the local nostr
 * secret when available (passkey/nsec); for NIP-07 a random key is generated
 * once and stored NIP-44-encrypted to self.
 */
async function getVaultSignerSecret(): Promise<Uint8Array> {
  const signer = requireSigner();
  const orgPubkey = state.orgPubkey;
  if (!orgPubkey) throw new Error("No active org");
  if (signer.secretKey) return vaultSignerKeys(signer.secretKey).secretKey;
  // NIP-07 path
  const storeKey = `bitmoot.vaultsigner.${orgPubkey}`;
  const existing = localStorage.getItem(storeKey);
  if (existing) return hexToBytes(await signer.nip44DecryptFrom(signer.pubkey, existing));
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
  seed: string;
}

export async function createOrg(opts: CreateOrgOptions): Promise<CreatedOrg> {
  const signer = requireSigner();
  const seed = generateOrgSeed();
  const { secretKey: orgSk, pubkey: orgPubkey, npub: orgNpub } = orgNostrKeys(seed);
  const addr = orgAddress(orgPubkey);

  const council = [signer.pubkey];
  for (const npub of opts.councilNpubs) {
    const hex = npubToHex(npub);
    if (hex !== signer.pubkey) council.push(hex);
  }

  const mySecret = await getVaultSignerSecret();
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

  const configEvent = finalizeEvent(
    {
      kind: Kind.OrgConfig,
      created_at: config.createdAt,
      tags: [["d", ORG_ID], ["a", addr], ["name", config.name]],
      content: JSON.stringify(config),
    },
    orgSk,
  );

  const shareEvents: VerifiedEvent[] = [];
  for (const memberPubkey of council) {
    const payload = JSON.stringify({ mnemonic: seed });
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

  await publish(configEvent);
  await Promise.allSettled(shareEvents.map((ev) => publish(ev)));
  await publish(signerEvent);

  setSettings({ activeOrgNpub: orgNpub });
  store.seed = seed;
  ensureSubscribed();
  return { orgNpub, seed };
}

export async function joinOrg(note: string): Promise<void> {
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

/** Decrypt this member's wallet share and unlock the treasury (Spark + org key). */
export async function unlockTreasury(): Promise<string> {
  const orgPubkey = state.orgPubkey;
  if (!orgPubkey) throw new Error("No active org");
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
      };
      if (!json.mnemonic) continue;
      const keys = orgNostrKeys(json.mnemonic);
      if (keys.pubkey !== orgPubkey) continue; // wrong org
      store.seed = json.mnemonic;
      rebuild();
      return json.mnemonic;
    } catch {
      /* try next share */
    }
  }
  throw new Error("No wallet share found for your key on this org");
}

export function lockTreasury() {
  store.seed = null;
  disconnectOrgWallet();
  rebuild();
}

export function treasurySeed(): string | null {
  return store.seed;
}

/** Approve a join request: send them a seed share and extend the council + vault. */
export async function approveMember(memberPubkey: string): Promise<void> {
  const { seed, orgSk, orgPubkey } = requireSeed();
  const config = state.config;
  if (!config) throw new Error("Org config not loaded yet");
  const addr = orgAddress(orgPubkey);
  if (config.council.includes(memberPubkey)) throw new Error("Already a council member");

  const council = [...config.council, memberPubkey];
  const vaultSigners = [...config.vaultSigners];

  // look up the member's published vault key
  const signerEvents = await query({
    kinds: [Kind.VaultSigner],
    authors: [memberPubkey],
    "#d": [ORG_ID],
  });
  const latestSigner = signerEvents.sort((a, b) => b.created_at - a.created_at)[0];
  const xOnly = latestSigner ? parseJsonContent<{ xOnly: string }>(latestSigner)?.xOnly : null;
  if (!xOnly) throw new Error("Member has not published a vault signer key");
  if (!vaultSigners.includes(xOnly)) vaultSigners.push(xOnly);

  const updated: OrgConfig = { ...config, council, vaultSigners };

  const configEvent = finalizeEvent(
    {
      kind: Kind.OrgConfig,
      created_at: now(),
      tags: [["d", ORG_ID], ["a", addr], ["name", config.name]],
      content: JSON.stringify(updated),
    },
    orgSk,
  );

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

  await publish(configEvent);
  await publish(shareEvent);
}

/** Re-sync config vault signers from published vault keys (explicit, safe). */
export async function syncVaultSigners(): Promise<void> {
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
  const configEvent = finalizeEvent(
    {
      kind: Kind.OrgConfig,
      created_at: now(),
      tags: [["d", ORG_ID], ["a", addr], ["name", config.name]],
      content: JSON.stringify(updated),
    },
    orgSk,
  );
  await publish(configEvent);
}

export async function publishVaultSigner(): Promise<void> {
  const orgPubkey = state.orgPubkey;
  if (!orgPubkey) throw new Error("No active org");
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

export interface ProposalInput {
  title: string;
  body: string;
  type: "payment" | "general";
  amountSats?: number;
  onchainAddress?: string;
}

export async function createProposal(input: ProposalInput): Promise<void> {
  const orgPubkey = state.orgPubkey;
  if (!orgPubkey) throw new Error("No active org");
  const ev = await signAsMe({
    kind: Kind.Proposal,
    created_at: now(),
    tags: [
      ["d", crypto.randomUUID()],
      ["a", orgAddress(orgPubkey)],
    ],
    content: JSON.stringify(input),
  });
  await publish(ev);
}

export async function castVote(proposalId: string, choice: VoteChoice): Promise<void> {
  const orgPubkey = state.orgPubkey;
  if (!orgPubkey) throw new Error("No active org");
  const ev = await signAsMe({
    kind: Kind.Vote,
    created_at: now(),
    tags: [
      ["d", proposalId],
      ["a", orgAddress(orgPubkey)],
      ["e", proposalId],
    ],
    content: JSON.stringify({ choice }),
  });
  await publish(ev);
}

export async function publishFeedPost(text: string): Promise<void> {
  const orgPubkey = state.orgPubkey;
  if (!orgPubkey) throw new Error("No active org");
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
  if (!proposal.onchainAddress || !proposal.amountSats) throw new Error("Proposal has no payment details");
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
  const events = await query({
    kinds: [Kind.PsbtCosign],
    "#e": [proposal.id],
  });
  if (!events.length) throw new Error("No PSBT found for this proposal");
  // pick any existing contribution as the base PSBT (they share the unsigned tx)
  events.sort((a, b) => b.created_at - a.created_at);
  const base = parseJsonContent<{ psbt: string }>(events[0])?.psbt;
  if (!base) throw new Error("Invalid PSBT event");
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

/** Step 3: combine all collected signatures, broadcast, and record execution. */
export async function executeVaultSpend(proposal: ProposalView): Promise<string> {
  const orgPubkey = state.orgPubkey;
  if (!orgPubkey) throw new Error("No active org");
  const config = state.config;
  const vault = state.vault;
  if (!config || !vault) throw new Error("Vault is not complete");

  const events = await query({ kinds: [Kind.PsbtCosign], "#e": [proposal.id] });
  if (!events.length) throw new Error("No PSBTs found for this proposal");

  // latest per author
  const byAuthor = new Map<string, Event>();
  for (const ev of events) {
    const existing = byAuthor.get(ev.pubkey);
    if (!existing || existing.created_at < ev.created_at) byAuthor.set(ev.pubkey, ev);
  }
  const psbts = [...byAuthor.values()]
    .map((ev) => parseJsonContent<{ psbt: string }>(ev)?.psbt)
    .filter((p): p is string => Boolean(p));

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
