import { sha256 } from "@noble/hashes/sha2.js";
import { toHex } from "./keys";
import { getAuth } from "./auth";
import { getSettings, setSettings, DEFAULT_BLOSSOM_SERVERS } from "./settings";

/**
 * Blossom blob storage client (BUD-01/BUD-02).
 *
 * Files are hashed locally (sha256), then uploaded with a signed
 * "blossom" auth event (kind 24242, `t: "upload"`, `x: <sha256>`,
 * `expiration: +1h`) as the Nostr authorization header. The server answers
 * with a BUD-01 descriptor: { url, sha256, size, type }. The returned URL is
 * what ends up in note content, so any NIP-27 client embeds it.
 */

const KIND_BLOSSOM_AUTH = 24242;

export interface BlossomDescriptor {
  url: string;
  sha256: string;
  size?: number;
  type?: string;
}

export function blossomServers(): string[] {
  const s = getSettings().blossomServers;
  return s && s.length ? s : [...DEFAULT_BLOSSOM_SERVERS];
}

export function setBlossomServers(servers: string[]) {
  setSettings({ blossomServers: servers });
}

function normalizeServer(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Sign a BUD-02 upload auth event with the signed-in identity. */
async function buildAuthHeader(fileHash: string, sizeHint?: string): Promise<string> {
  const signer = getAuth().signer;
  if (!signer) throw new Error("Sign in to upload files");
  const event = await signer.signEvent({
    kind: KIND_BLOSSOM_AUTH,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["t", "upload"],
      ["x", fileHash],
      ["name", sizeHint ?? "file"],
      ["expiration", String(Math.floor(Date.now() / 1000) + 3600)],
    ],
    content: "Blossom blob upload",
  });
  return `Nostr ${btoa(JSON.stringify(event))}`;
}

/**
 * Upload a file to the first Blossom server that accepts it. `onProgress`
 * reports 0–100 while bytes are on the wire. Falls through to the next
 * configured server when one refuses (auth, quota, payment required…).
 */
export async function uploadToBlossom(
  file: Blob & { name?: string },
  opts: { onProgress?: (pct: number) => void } = {},
): Promise<BlossomDescriptor> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileHash = toHex(sha256(bytes));
  const auth = await buildAuthHeader(fileHash, file.name ?? `${file.type || "file"}`);
  const servers = blossomServers();
  if (!servers.length) throw new Error("No Blossom server configured (Settings → Media)");

  let lastError = "Upload failed";
  for (const rawServer of servers) {
    const server = normalizeServer(rawServer);
    try {
      return await new Promise<BlossomDescriptor>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", `${server}/upload`);
        xhr.setRequestHeader("Authorization", auth);
        if (file.type) xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status < 200 || xhr.status >= 300) {
            reject(new Error(`${server} → HTTP ${xhr.status}${xhr.responseText ? `: ${xhr.responseText.slice(0, 140)}` : ""}`));
            return;
          }
          try {
            const desc = JSON.parse(xhr.responseText) as Partial<BlossomDescriptor> & { url?: string };
            resolve({
              url: desc.url ?? `${server}/${fileHash}`,
              sha256: desc.sha256 ?? fileHash,
              size: desc.size ?? file.size,
              type: desc.type ?? file.type,
            });
          } catch {
            // Server stored the blob but answered non-JSON — the canonical
            // BUD-01 URL is /<sha256>.
            resolve({ url: `${server}/${fileHash}`, sha256: fileHash, size: file.size, type: file.type });
          }
        };
        xhr.onerror = () => reject(new Error(`${server} → network error`));
        xhr.ontimeout = () => reject(new Error(`${server} → timed out`));
        xhr.send(file);
      });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      opts.onProgress?.(0); // reset for the next server attempt
    }
  }
  throw new Error(lastError);
}

/** True when a pasted/dropped File is media the composer can embed. */
export function isEmbeddableMedia(file: File): boolean {
  if (file.type.startsWith("image/") || file.type.startsWith("video/")) return true;
  return /\.(png|jpe?g|gif|webp|avif|heic|mp4|webm|mov|mkv)$/i.test(file.name);
}
