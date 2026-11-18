import { useEffect, useState } from "react";
import { npubEncode } from "nostr-tools/nip19";
import type { Event } from "nostr-tools";
import { Kind, publish, query, subscribe } from "./nostr";
import { getAuth } from "./auth";

/**
 * Public Nostr profile metadata (kind 0, NIP-01).
 *
 * Profiles are public and cached in memory. They are fetched on demand for the
 * pubkeys shown in the UI and kept up to date with a live relay subscription,
 * so names, avatars and contact details work with no backend.
 */

export interface NostrProfile {
  name?: string;
  /** Standard NIP-01 display name field. */
  display_name?: string;
  /** Legacy alias still published by some clients. */
  displayName?: string;
  /** Short username used by a few clients. */
  username?: string;
  about?: string;
  description?: string;
  picture?: string;
  banner?: string;
  /** NIP-05 identifier, e.g. lina@example.com. */
  nip05?: string;
  /** LNURL-pay (LUD-06). */
  lud06?: string;
  /** Lightning address (LUD-16). */
  lud16?: string;
  website?: string;
  bot?: boolean;
  /** Preserve other metadata fields a client may have published. */
  [key: string]: unknown;
}

interface CachedProfile {
  profile: NostrProfile | null;
  createdAt: number;
  /** Last time relays were asked, so stale profiles can be re-fetched. */
  fetchedAt: number;
}

const PROFILE_TTL_MS = 60_000;
const cache = new Map<string, CachedProfile>();
const listeners = new Set<() => void>();
const inFlight = new Set<string>();

function emit() {
  for (const listener of listeners) listener();
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** Normalize the many spellings clients use for the same NIP-01 fields. */
function normalizeProfile(raw: Record<string, unknown>): NostrProfile {
  const displayName =
    cleanString(raw.display_name) ?? cleanString(raw.displayName) ?? cleanString(raw.username);
  return {
    ...raw,
    name: cleanString(raw.name) ?? displayName,
    display_name: displayName,
    displayName: displayName,
    username: cleanString(raw.username),
    about: cleanString(raw.about) ?? cleanString(raw.description),
    description: cleanString(raw.description),
    picture: cleanString(raw.picture),
    banner: cleanString(raw.banner),
    nip05: cleanString(raw.nip05),
    lud06: cleanString(raw.lud06),
    lud16: cleanString(raw.lud16),
    website: cleanString(raw.website),
    bot: typeof raw.bot === "boolean" ? raw.bot : undefined,
  };
}

export function ingestProfile(event: Event) {
  const current = cache.get(event.pubkey);
  if (current && current.createdAt > event.created_at) return;
  try {
    const raw = JSON.parse(event.content) as Record<string, unknown>;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    cache.set(event.pubkey, {
      profile: normalizeProfile(raw),
      createdAt: event.created_at,
      fetchedAt: Math.max(current?.fetchedAt ?? 0, Date.now()),
    });
    emit();
  } catch {
    // Ignore malformed metadata events.
  }
}

/** Fetch the newest kind 0 for each requested pubkey. */
export async function fetchProfiles(pubkeys: string[], force = false): Promise<void> {
  const authors = [...new Set(pubkeys)].filter((p) => /^[0-9a-f]{64}$/.test(p));
  const now = Date.now();
  const due = authors.filter((pubkey) => {
    if (inFlight.has(pubkey)) return false;
    const current = cache.get(pubkey);
    if (force) return true;
    if (!current) return true;
    return now - current.fetchedAt > PROFILE_TTL_MS;
  });
  if (!due.length) return;

  for (const pubkey of due) inFlight.add(pubkey);
  // Mark as fetched now so missing profiles don't refetch on every render.
  for (const pubkey of due) {
    const current = cache.get(pubkey);
    cache.set(pubkey, {
      profile: current?.profile ?? null,
      createdAt: current?.createdAt ?? 0,
      fetchedAt: now,
    });
  }

  try {
    const events = await query(
      {
        kinds: [Kind.Profile],
        authors: due,
        limit: Math.max(20, due.length * 10),
      },
      8000,
    );
    // Oldest first so the newest valid event wins.
    events.sort((a, b) => a.created_at - b.created_at);
    for (const event of events) ingestProfile(event);
  } finally {
    for (const pubkey of due) inFlight.delete(pubkey);
  }
  emit();
}

export function getProfile(pubkey: string): NostrProfile | null {
  return cache.get(pubkey)?.profile ?? null;
}

/** True once relays have been queried for this pubkey, even if nothing was found. */
export function hasProfileLoaded(pubkey: string): boolean {
  const cached = cache.get(pubkey);
  return Boolean(cached && cached.fetchedAt > 0);
}

function snapshot(pubkeys: string[]): Record<string, NostrProfile> {
  const out: Record<string, NostrProfile> = {};
  for (const pubkey of pubkeys) {
    const profile = cache.get(pubkey)?.profile;
    if (profile) out[pubkey] = profile;
  }
  return out;
}

export function useProfile(pubkey?: string | null): NostrProfile | null {
  return useProfiles(pubkey ? [pubkey] : [])[pubkey ?? ""] ?? null;
}

/** Subscribe to profile metadata for a list of pubkeys. */
export function useProfiles(pubkeys: string[]): Record<string, NostrProfile> {
  const key = [...new Set(pubkeys)].sort().join(",");
  const [profiles, setProfiles] = useState<Record<string, NostrProfile>>(() =>
    snapshot(key ? key.split(",") : []),
  );

  useEffect(() => {
    const authors = key ? key.split(",") : [];
    let active = true;
    const update = () => {
      if (active) setProfiles(snapshot(authors));
    };

    update();
    if (authors.length) void fetchProfiles(authors).then(update).catch(() => undefined);

    listeners.add(update);
    const unsub = authors.length
      ? subscribe({ kinds: [Kind.Profile], authors }, (event) => ingestProfile(event))
      : () => undefined;

    return () => {
      active = false;
      listeners.delete(update);
      unsub();
    };
  }, [key]);

  return profiles;
}

/** Publish the signed-in user's kind 0 metadata event. */
export async function saveProfile(input: NostrProfile): Promise<void> {
  const signer = getAuth().signer;
  if (!signer) throw new Error("Sign in to edit your profile");
  const displayName = cleanString(input.displayName) ?? cleanString(input.display_name);
  const content: Record<string, unknown> = { ...(getProfile(signer.pubkey) ?? {}) };

  // Publish standard field names; drop legacy aliases and conflicting bio keys.
  delete content.displayName;
  delete content.description;

  const fields: Record<string, string | undefined> = {
    name: cleanString(input.name) ?? displayName,
    display_name: displayName,
    about: cleanString(input.about),
    picture: cleanString(input.picture),
    banner: cleanString(input.banner),
    nip05: cleanString(input.nip05),
    lud06: cleanString(input.lud06),
    lud16: cleanString(input.lud16),
    website: cleanString(input.website),
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) delete content[key];
    else content[key] = value;
  }

  const event = await signer.signEvent({
    kind: Kind.Profile,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(content),
  });
  await publish(event);
  ingestProfile(event);
}

/** Human-readable label that always works, even without a profile event. */
export function profileLabel(pubkey: string, profile?: NostrProfile | null): string {
  const name = cleanString(profile?.display_name) ?? cleanString(profile?.displayName) ?? cleanString(profile?.name);
  if (name) return name;
  try {
    const npub = pubkey.startsWith("npub") ? pubkey : npubEncode(pubkey);
    return `${npub.slice(0, 10)}…${npub.slice(-6)}`;
  } catch {
    return `${pubkey.slice(0, 8)}…${pubkey.slice(-4)}`;
  }
}

/** Secondary line for profile cards: Nostr address, Lightning, website, then name. */
export function profileSubtitle(profile?: NostrProfile | null): string {
  if (!profile) return "";
  return (
    cleanString(profile.nip05) ??
    cleanString(profile.lud16) ??
    cleanString(profile.lud06) ??
    cleanString(profile.website) ??
    cleanString(profile.name) ??
    ""
  );
}

export function websiteUrl(website?: string | null): string | null {
  const value = cleanString(website);
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function lightningUri(profile?: NostrProfile | null): string | null {
  if (!profile) return null;
  const address = cleanString(profile.lud16) ?? cleanString(profile.lud06);
  return address ? `lightning:${address}` : null;
}
