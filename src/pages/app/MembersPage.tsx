import { useState } from "react";
import { toast } from "sonner";
import { Key, Crown, UserPlus, RefreshCw, Users, Lock, ShieldCheck, Unlock } from "lucide-react";
import {
  approveMember, publishVaultSigner, shortNpub, syncVaultSigners, treasurySeed, useOrg,
} from "../../lib/org";

function shortXOnly(x: string): string {
  return `${x.slice(0, 8)}…${x.slice(-6)}`;
}

export function MembersPage() {
  const org = useOrg();
  const [busy, setBusy] = useState<string | null>(null);
  const seedUnlocked = Boolean(treasurySeed());

  const council = org.members.filter((m) => m.isCouncil);
  const others = org.members.filter((m) => !m.isCouncil);
  const threshold = org.config?.threshold ?? 0;
  const vaultSigners = org.config?.vaultSigners ?? [];

  const run = async (key: string, label: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      toast.success(label);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const approve = (pubkey: string) =>
    run(`approve:${pubkey}`, "Member approved — seed share sent", () => approveMember(pubkey));

  const publish = () => run("publish", "Vault signer key published", publishVaultSigner);

  const sync = () => run("sync", "Vault signers synced", syncVaultSigners);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif italic">Members</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Identified by Nostr keys. Council members vote and co-sign treasury moves.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={publish}
            disabled={busy === "publish"}
            className="h-10 px-4 rounded-md border border-border bg-bg-elev-2/50 text-sm flex items-center gap-2 hover:border-border-bright transition disabled:opacity-50"
          >
            <Key className="h-4 w-4" /> {busy === "publish" ? "Publishing…" : "Publish my signer key"}
          </button>
          <button
            onClick={sync}
            disabled={busy === "sync" || !seedUnlocked}
            title={seedUnlocked ? undefined : "Unlock the treasury (org key) to re-publish the config"}
            className="h-10 px-4 rounded-md border border-border bg-bg-elev-2/50 text-sm flex items-center gap-2 hover:border-border-bright transition disabled:opacity-50"
          >
            <RefreshCw className={"h-4 w-4 " + (busy === "sync" ? "animate-spin" : "")} /> Sync vault signers
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l: "Members", v: String(org.members.length) },
          { l: "Council", v: String(council.length) },
          { l: "Vault signers", v: String(vaultSigners.length) },
          { l: "Threshold", v: `${threshold}-of-${vaultSigners.length}` },
        ].map((s) => (
          <div key={s.l} className="rounded-lg border border-border bg-bg-elev-1/50 p-4">
            <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{s.l}</div>
            <div className="text-2xl font-semibold mt-1">{s.v}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-bg-elev-1/50 overflow-hidden">
        <div className="hidden md:grid grid-cols-12 px-5 py-3 border-b border-border text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-bg-elev-2/40">
          <div className="col-span-4">Member</div>
          <div className="col-span-4">Vault signer key</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-2 text-right">In vault</div>
        </div>
        <div className="divide-y divide-border">
          {org.members.length === 0 && (
            <div className="px-5 py-6 text-sm text-muted-foreground">
              {org.loading ? "Loading members from relays…" : "No members yet."}
            </div>
          )}
          {org.members.map((m) => {
            const inVault = m.vaultXOnly != null && vaultSigners.includes(m.vaultXOnly);
            return (
              <div key={m.pubkey} className="px-5 py-3.5 grid grid-cols-1 md:grid-cols-12 gap-3 items-center hover:bg-bg-elev-2/40 transition">
                <div className="md:col-span-4 flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-primary to-[oklch(0.82_0.17_70)] flex items-center justify-center text-[10px] font-bold text-primary-foreground">
                    {shortNpub(m.npub).replace("…", "").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-1.5">
                      {shortNpub(m.npub)}
                      {m.isCouncil && council.length > 0 && m.pubkey === council[0].pubkey && (
                        <span title="First council member (org creator)" className="flex">
                          <Crown className="h-3 w-3 text-[var(--yellow)]" />
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono">{m.npub.slice(0, 20)}…</div>
                  </div>
                </div>
                <div className="md:col-span-4 font-mono text-[11px] text-muted-foreground truncate">
                  {m.vaultXOnly ? shortXOnly(m.vaultXOnly) : "— not published —"}
                </div>
                <div className="md:col-span-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border border-border bg-bg-elev-2/50">
                    {m.isCouncil ? "council" : "member"}
                  </span>
                </div>
                <div className="md:col-span-2 flex md:justify-end">
                  {inVault ? (
                    <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border border-primary/30 text-primary bg-primary-dim flex items-center gap-1">
                      <Key className="h-2.5 w-2.5" /> signer
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground-2">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-bg-elev-1/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-medium">
            <UserPlus className="h-4 w-4 text-primary" /> Join requests
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground-2">
              kind 9703
            </span>
          </div>
          {!seedUnlocked && (
            <span className="text-[11px] font-mono text-[var(--yellow)] flex items-center gap-1.5">
              <Lock className="h-3 w-3" /> unlock treasury to approve
            </span>
          )}
        </div>
        <div className="divide-y divide-border">
          {org.joinRequests.length === 0 && (
            <div className="px-5 py-6 text-sm text-muted-foreground">No pending join requests.</div>
          )}
          {org.joinRequests.map((r) => (
            <div key={r.author + r.createdAt} className="px-5 py-3.5 flex items-center gap-4 hover:bg-bg-elev-2/40 transition">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium font-mono">{shortNpub(r.author)}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {r.note || "(no note)"} · {new Date(r.createdAt * 1000).toLocaleDateString()}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground-2 mt-0.5">
                  vault key: {r.vaultXOnly ? shortXOnly(r.vaultXOnly) : "not published"}
                </div>
              </div>
              <button
                onClick={() => approve(r.author)}
                disabled={busy === `approve:${r.author}` || !seedUnlocked}
                className="h-9 px-3 shrink-0 rounded-md bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1.5 hover:opacity-90 transition disabled:opacity-50"
              >
                {busy === `approve:${r.author}` ? (
                  "Approving…"
                ) : seedUnlocked ? (
                  <>
                    <Unlock className="h-3.5 w-3.5" /> Approve
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" /> Locked
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {others.length > 0 && (
        <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5 text-xs text-muted-foreground flex items-start gap-3">
          <Users className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <div>
            {others.length} non-council {others.length === 1 ? "member has" : "members have"} published signer keys. Sync
            vault signers to pull them into the vault config — the council may then raise the threshold.
          </div>
        </div>
      )}

      {!org.vaultComplete && (
        <div className="rounded-lg border border-[var(--yellow)]/30 bg-[var(--yellow)]/5 p-4 text-xs font-mono flex items-center gap-3">
          <ShieldCheck className="h-4 w-4 text-[var(--yellow)] shrink-0" />
          VAULT INCOMPLETE — {threshold} of {vaultSigners.length} signer keys published. Members must publish their
          signer keys, then a council member syncs the vault.
        </div>
      )}
    </div>
  );
}
