import { SimplePool } from "nostr-tools";
import type { Event, EventTemplate, Filter, VerifiedEvent } from "nostr-tools";
import { getSettings } from "./settings";

/**
 * Nostr transport layer.
 *
 * BitMoot-specific event kinds (custom, experimental):
 *  - 30078 OrgConfig   — addressable org configuration, authored by the org key
 *  - 30079 WalletShare — NIP-44 encrypted org wallet seed, one event per recipient
 *  - 30080 VaultSigner — member's vault signer x-only pubkey
 *  - 30081 PsbtCosign  — PSBT exchange for taproot multisig co-signing
 *  - 37000 Proposal    — governance proposal
 *  - 30052 Vote        — vote on a proposal (replaceable per member)
 *  - 9705  Execution   — on-chain execution record for a proposal
 *  - 9703  JoinRequest — ask to join an org
 */
export const Kind = {
  /** NIP-01 user profile metadata. */
  Profile: 0,
  OrgConfig: 30078,
  WalletShare: 30079,
  VaultSigner: 30080,
  PsbtCosign: 30081,
  Proposal: 37000,
  Vote: 30052,
  Execution: 9705,
  JoinRequest: 9703,
} as const;

export type NostrEvent = Event;

let pool: SimplePool | null = null;

export function getPool(): SimplePool {
  if (!pool) pool = new SimplePool();
  return pool;
}

/** Current relay list from settings. */
export function relays(): string[] {
  return getSettings().relays;
}

/** Publish an event to all configured relays. Resolves when at least one relay accepts it. */
export async function publish(event: Event): Promise<void> {
  const results = getPool().publish(relays(), event, { maxWait: 8000 });
  const settled = await Promise.allSettled(results);
  const ok = settled.some((r) => r.status === "fulfilled");
  if (!ok) throw new Error("Failed to publish to any relay");
}

/** Query multiple relays for events matching the filter (deduplicated). */
export async function query(filter: Filter, maxWait?: number): Promise<Event[]> {
  return getPool().querySync(relays(), filter, { maxWait });
}

/** Query and return the newest matching event. */
export async function queryLatest(filter: Filter): Promise<Event | null> {
  const events = await query(filter);
  if (!events.length) return null;
  return events.reduce((a, b) => (b.created_at > a.created_at ? b : a));
}

/** Fetch the latest version of an addressable (replaceable/parameterized) event. */
export async function fetchAddressable(
  kind: number,
  authorPubkey: string,
  d: string,
): Promise<Event | null> {
  return queryLatest({ kinds: [kind], authors: [authorPubkey], "#d": [d] });
}

/**
 * Live subscription over all configured relays.
 * Returns an unsubscribe function.
 */
export function subscribe(
  filter: Filter,
  onevent: (event: Event) => void,
  onclose?: () => void,
): () => void {
  const sub = getPool().subscribeMany(relays(), filter, {
    onevent,
    onclose,
  });
  return () => sub.close();
}

/** `a` tag value (`kind:pubkey:d`) used to tag events to an org. */
export function orgAddressTag(orgPubkey: string, orgId: string): string {
  return `${Kind.OrgConfig}:${orgPubkey}:${orgId}`;
}

/** Parse event content as JSON, returning null when malformed. */
export function parseJsonContent<T>(event: Event): T | null {
  try {
    return JSON.parse(event.content) as T;
  } catch {
    return null;
  }
}

/** Read a single tag value off an event. */
export function tagValue(event: Event, name: string): string | undefined {
  const t = event.tags.find((t) => t[0] === name);
  return t?.[1];
}

export type { Event, EventTemplate, Filter, VerifiedEvent };
