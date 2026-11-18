import { useSyncExternalStore } from "react";

/**
 * App-wide settings (network, relay list, active org).
 * Persisted in localStorage, exposed as a tiny external store so React
 * components can subscribe with `useSettings()`.
 */

export type SparkNetwork = "MAINNET" | "REGTEST";

export interface Settings {
  network: SparkNetwork;
  relays: string[];
  /** npub (bech32) of the organization workspace the app is pointed at. */
  activeOrgNpub?: string;
  /** Optional esplora-compatible API base for on-chain vault ops. */
  explorerApiBase?: string;
  /** Show raw Nostr events, signatures, and PSBT data in governance views. */
  advancedMode?: boolean;
}

const KEY = "bitmoot.settings.v1";

export const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://relay.snort.social",
];

const DEFAULTS: Settings = {
  network: "MAINNET",
  relays: [...DEFAULT_RELAYS],
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const settings: Settings = {
      network: parsed.network === "REGTEST" ? "REGTEST" : "MAINNET",
      relays: Array.isArray(parsed.relays) && parsed.relays.length
        ? parsed.relays.filter((r) => typeof r === "string")
        : [...DEFAULT_RELAYS],
      activeOrgNpub: typeof parsed.activeOrgNpub === "string" ? parsed.activeOrgNpub : undefined,
      explorerApiBase:
        typeof parsed.explorerApiBase === "string" ? parsed.explorerApiBase : undefined,
      advancedMode: parsed.advancedMode === true,
    };
    return settings;
  } catch {
    return { ...DEFAULTS };
  }
}

let state: Settings = load();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getSettings(): Settings {
  return state;
}

export function setSettings(patch: Partial<Settings>) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}

/** Subscribe to settings changes outside of React. */
export function subscribeSettings(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Bitcoin L1 network for vault/explorer operations. */
export function bitcoinNetwork(s: Settings = state): "mainnet" | "testnet" | "regtest" {
  return s.network === "REGTEST" ? "regtest" : "mainnet";
}
