import { Bitcoin, Wallet, Zap } from "lucide-react";
import { shortNpub, type OrgState } from "../lib/org";
import { CopyButton } from "./ui";

function shortAddress(address: string): string {
  return address.length > 22 ? `${address.slice(0, 12)}…${address.slice(-8)}` : address;
}

/**
 * Makes the shared org wallet explicit on every money-related screen.
 * The Bitcoin address is the taproot vault; the Lightning/Spark account is
 * derived from the same org identity, never from the signed-in member's key.
 */
export function OrgWalletNote({ org, compact = false }: { org: OrgState; compact?: boolean }) {
  if (!org.orgPubkey) return null;
  const walletId = org.orgNpub ?? org.orgPubkey;
  const bitcoinAddress = org.vault?.address;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-primary/20 bg-primary-dim/30 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-medium text-primary">
          <Wallet className="h-3.5 w-3.5" /> Shared org wallet
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Bitcoin className="h-3.5 w-3.5" />
          {bitcoinAddress ? shortAddress(bitcoinAddress) : "vault not ready"}
          {bitcoinAddress && (
            <CopyButton
              value={bitcoinAddress}
              label=""
              title="Copy Bitcoin address"
              className="h-5 w-5 px-0"
            />
          )}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-[var(--yellow)]" /> {shortNpub(walletId)}
          <CopyButton value={walletId} label="" title="Copy org npub" className="h-5 w-5 px-0" />
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primary/20 bg-primary-dim/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Wallet className="h-4 w-4 text-primary" /> Shared organization wallet
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Proposals, treasury, members and payments all use this wallet — never your personal one.
          </p>
        </div>
        <CopyButton value={walletId} label="Copy org npub" />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-border bg-bg-elev-2/40 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground-2">
            <Bitcoin className="h-3 w-3" /> Bitcoin address
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 break-all font-mono text-[11px]">
              {bitcoinAddress ?? "Waiting for member signer keys"}
            </div>
            {bitcoinAddress && (
              <CopyButton
                value={bitcoinAddress}
                label="Copy address"
                title="Copy Bitcoin address"
                className="h-7 shrink-0 px-2 text-[10px]"
              />
            )}
          </div>
        </div>
        <div className="rounded-md border border-border bg-bg-elev-2/40 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground-2">
            <Zap className="h-3 w-3 text-[var(--yellow)]" /> Lightning / Spark account
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 break-all font-mono text-[11px]">{shortNpub(walletId)}</div>
            <CopyButton
              value={walletId}
              label="Copy npub"
              title="Copy org npub"
              className="h-7 shrink-0 px-2 text-[10px]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
