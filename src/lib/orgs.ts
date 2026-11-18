import { useEffect, useState, useSyncExternalStore } from "react";
import { npubEncode } from "nostr-tools/nip19";
import { getAuth } from "./auth";
import { Kind, parseJsonContent, query, tagValue } from "./nostr";
import { ORG_ID, lockTreasury, npubToHex, type OrgConfig } from "./org";
import { getSettings, setSettings } from "./settings";

/**
 * Org discovery for the signed-in Nostr identity.
 *
 * An org is found when the user is a council member (`p` tag on the org
 * config), holds a decrypted wallet share (`p` tag on kind 30079), or has an
 * outstanding join request (`a` tag on kind 9703). All three are public
 * Nostr events, so no account database is needed.
 */

export type OrgRelation = "council" | "member" | "pending" | "known";

export interface DiscoveredOrg {
  pubkey: string;
  npub: string;
  config: OrgConfig | null;
  name: string;
  relation: OrgRelation;
}

const relationRank: Record<OrgRelation, number> = {
  council: 0,
  member: 1,
  pending: 2,
  known: 3,
};

function pubkeyFromAddress(address?: string): string | null {
  if (!address) return null;
  const parts = address.split(":");
  return parts.length >= 2 && /^[0-9a-f]{64}$/.test(parts[1]) ? parts[1] : null;
}

export async function discoverOrgs(myPubkey: string): Promise<DiscoveredOrg[]> {
  const [configs, shares, requests] = await Promise.all([
    query({ kinds: [Kind.OrgConfig], "#p": [myPubkey], limit: 200 }),
    query({ kinds: [Kind.WalletShare], "#p": [myPubkey], limit: 200 }),
    query({ kinds: [Kind.JoinRequest], authors: [myPubkey], limit: 200 }),
  ]);

  const councilOrgs = new Set(configs.map((event) => event.pubkey));
  const memberOrgs = new Set(shares.map((event) => event.pubkey));
  const pendingOrgs = new Set(
    requests.map((event) => pubkeyFromAddress(tagValue(event, "a"))).filter((p): p is string => Boolean(p)),
  );

  const active = getSettings().activeOrgNpub;

  const candidates = new Set<string>([
    ...councilOrgs,
    ...memberOrgs,
    ...pendingOrgs,
  ]);
  if (active) {
    try {
      candidates.add(npubToHex(active));
    } catch {
      // Ignore a stale setting.
    }
  }

  const result = await Promise.all(
    [...candidates].map(async (pubkey): Promise<DiscoveredOrg | null> => {
      const event =
        configs.find((candidate) => candidate.pubkey === pubkey) ??
        (await query({ kinds: [Kind.OrgConfig], authors: [pubkey], "#d": [ORG_ID], limit: 1 }))
          .sort((a, b) => b.created_at - a.created_at)[0];
      const config = event ? parseJsonContent<OrgConfig>(event) : null;
      const relation: OrgRelation = councilOrgs.has(pubkey)
        ? "council"
        : memberOrgs.has(pubkey)
          ? "member"
          : pendingOrgs.has(pubkey)
            ? "pending"
            : "known";
      return {
        pubkey,
        npub: npubEncode(pubkey),
        config,
        name: config?.name?.trim() || "Unnamed organization",
        relation,
      };
    }),
  );

  return result
    .filter((org): org is DiscoveredOrg => Boolean(org))
    .sort((a, b) => {
      const byRelation = relationRank[a.relation] - relationRank[b.relation];
      return byRelation || a.name.localeCompare(b.name);
    });
}

/** Small external store so discovery never calls React setState from an effect. */
interface DiscoveryState {
  orgs: DiscoveredOrg[];
  loading: boolean;
}

const EMPTY_DISCOVERY: DiscoveryState = { orgs: [], loading: false };
const discoveryByKey = new Map<string, DiscoveryState>();
const discoveryListeners = new Set<() => void>();

function emitDiscovery() {
  for (const listener of discoveryListeners) listener();
}

function discoveryKey(pubkey: string, nonce: number): string {
  return `${pubkey}:${nonce}`;
}

function startDiscovery(pubkey: string, nonce: number) {
  const key = discoveryKey(pubkey, nonce);
  if (discoveryByKey.has(key)) return;
  discoveryByKey.set(key, { orgs: [], loading: true });
  emitDiscovery();
  discoverOrgs(pubkey)
    .then((orgs) => {
      discoveryByKey.set(key, { orgs, loading: false });
    })
    .catch(() => {
      discoveryByKey.set(key, { orgs: [], loading: false });
    })
    .finally(emitDiscovery);
}

function subscribeDiscovery(listener: () => void) {
  discoveryListeners.add(listener);
  return () => discoveryListeners.delete(listener);
}

/** React view of organizations associated with the current identity. */
export function useMyOrgs(): { orgs: DiscoveredOrg[]; loading: boolean; reload: () => void } {
  const signerPubkey = getAuth().signer?.pubkey;
  const [nonce, setNonce] = useState(0);
  const key = signerPubkey ? discoveryKey(signerPubkey, nonce) : "";
  const snapshot = () => (key ? discoveryByKey.get(key) ?? EMPTY_DISCOVERY : EMPTY_DISCOVERY);
  const state = useSyncExternalStore(subscribeDiscovery, snapshot, snapshot);

  useEffect(() => {
    if (signerPubkey) startDiscovery(signerPubkey, nonce);
  }, [signerPubkey, nonce]);

  return {
    orgs: state.orgs,
    loading: Boolean(signerPubkey) && state.loading,
    reload: () => setNonce((n) => n + 1),
  };
}

/** Point the workspace at an org. Locks the previous org's treasury seed. */
export function switchOrg(npub: string) {
  npubToHex(npub); // validate before changing state
  if (getSettings().activeOrgNpub !== npub) lockTreasury();
  setSettings({ activeOrgNpub: npub });
}
