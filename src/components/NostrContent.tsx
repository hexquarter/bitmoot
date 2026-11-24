import type { ReactNode } from "react";
import * as nip27 from "nostr-tools/nip27";
import { profileLabel, type NostrProfile } from "../lib/profile";
import { shortNpub } from "../lib/org";

/**
 * Renders note content the way Nostr clients are meant to (NIP-27):
 *
 *  - `nostr:npub1…` references become @mentions resolved against profiles
 *  - `nostr:note1…`/`nevent1…`/`naddr1…` references become note links
 *  - `#hashtag` becomes a hashtag link (NIP-24)
 *  - URLs become anchors; image/video/audio URLs become inline media
 *
 * The exact `nostr:` URI is recovered from the original content slice so links
 * stay portable (njump understands full `nostr:` URIs).
 */

type ProfilesByPubkey = Record<string, NostrProfile | undefined>;
type ReferenceBlock = Extract<nip27.Block, { type: "reference" }>;

const linkClass = "text-primary hover:underline underline-offset-2 break-all";

function njumpHref(uri: string): string {
  return `https://njump.me/${uri}`;
}

function shortenUrl(url: string): string {
  const trimmed = url.replace(/^https?:\/\//, "");
  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
}

function referenceLabel(pointer: ReferenceBlock["pointer"], profiles: ProfilesByPubkey): string {
  if ("identifier" in pointer) {
    // NIP-33 addressable event
    return `note ${shortNpub(pointer.pubkey)}`;
  }
  if ("id" in pointer) {
    return `note ${shortNpub(pointer.id)}`;
  }
  return `@${profileLabel(pointer.pubkey, profiles[pointer.pubkey])}`;
}

function Reference({
  block,
  content,
  profiles,
}: {
  block: ReferenceBlock;
  content: string;
  profiles: ProfilesByPubkey;
}) {
  const uri = content.slice(block.start, block.end); // e.g. `nostr:npub1…`
  return (
    <a href={njumpHref(uri)} target="_blank" rel="noreferrer noopener" className={linkClass} title={uri}>
      {referenceLabel(block.pointer, profiles)}
    </a>
  );
}

function renderBlock(block: nip27.Block, content: string, profiles: ProfilesByPubkey, key: number, eager?: boolean): ReactNode {
  switch (block.type) {
    case "text":
      return <span key={key}>{block.text}</span>;
    case "hashtag":
      return (
        <a
          key={key}
          href={`https://njump.me/search?q=${encodeURIComponent(`#${block.value}`)}`}
          target="_blank"
          rel="noreferrer noopener"
          className={linkClass}
        >
          #{block.value}
        </a>
      );
    case "url":
      return (
        <a key={key} href={block.url} target="_blank" rel="noreferrer noopener" className={linkClass} title={block.url}>
          {shortenUrl(block.url)}
        </a>
      );
    case "image":
      return (
        <a key={key} href={block.url} target="_blank" rel="noreferrer noopener" className="mt-2 block">
          <img
            src={block.url}
            alt=""
            loading={eager ? "eager" : "lazy"}
            className="max-h-80 rounded-md border border-border object-contain"
          />
        </a>
      );
    case "video":
      return (
        <video
          key={key}
          src={block.url}
          controls
          className="mt-2 max-h-80 w-full rounded-md border border-border"
        />
      );
    case "audio":
      return <audio key={key} src={block.url} controls className="mt-2 w-full" />;
    case "reference":
      return <Reference key={key} block={block} content={content} profiles={profiles} />;
    case "relay":
      return (
        <span key={key} className="font-mono text-[11px] text-muted-foreground">
          {block.url}
        </span>
      );
    case "emoji":
      return (
        <img key={key} src={block.url} alt={`:${block.shortcode}:`} className="inline-block h-4 w-4 align-text-bottom" />
      );
  }
}

export function NostrContent({
  content,
  profiles,
  eager,
}: {
  content: string;
  profiles?: ProfilesByPubkey;
  /** Load media eagerly (used for the composer preview, right in view). */
  eager?: boolean;
}) {
  const byPubkey: ProfilesByPubkey = profiles ?? {};
  return (
    <>
      {[...nip27.parse(content)].map((block, i) => renderBlock(block, content, byPubkey, i, eager))}
    </>
  );
}
