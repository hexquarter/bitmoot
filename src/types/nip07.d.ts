import type { Event, EventTemplate } from "nostr-tools";

/**
 * NIP-07 `window.nostr` capability (browser extension such as Alby, nos2x).
 */
declare global {
  interface NostrNip07 {
    getPublicKey(): Promise<string>;
    signEvent(event: EventTemplate): Promise<Event>;
    nip04?: {
      encrypt(pubkey: string, plaintext: string): Promise<string>;
      decrypt(pubkey: string, ciphertext: string): Promise<string>;
    };
    nip44?: {
      encrypt(pubkey: string, plaintext: string): Promise<string>;
      decrypt(pubkey: string, ciphertext: string): Promise<string>;
    };
  }
  interface Window {
    nostr?: NostrNip07;
  }
}

export {};
