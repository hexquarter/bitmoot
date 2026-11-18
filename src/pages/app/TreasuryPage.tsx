import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Bitcoin, ArrowUpRight, ArrowDownRight, Copy, ExternalLink, Shield, Zap, Lock, Unlock, RefreshCw, Coins,
} from "lucide-react";
import { useOrg, unlockTreasury, treasurySeed } from "../../lib/org";
import {
  connectOrgWallet, getOrgBalances, getOrgStaticDepositAddress, getOrgTransfers,
  getOrgSparkAddress, formatUsdb, type OrgBalances, type OrgTransfer,
} from "../../lib/spark";
import { fetchAddressBalance, fetchUtxos, explorerUiBase } from "../../lib/vault";
import { OrgWalletNote } from "../../components/OrgWalletNote";

function fmtSats(n: bigint): string {
  return Number(n).toLocaleString("en-US");
}

function copy(text: string) {
  navigator.clipboard?.writeText(text);
  toast.success("Copied to clipboard");
}

export function TreasuryPage() {
  const org = useOrg();
  const canManage = org.myRole === "admin";
  const [balances, setBalances] = useState<OrgBalances | null>(null);
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [sparkAddress, setSparkAddress] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<OrgTransfer[]>([]);
  const [vaultBalance, setVaultBalance] = useState<bigint | null>(null);
  const [utxoCount, setUtxoCount] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!canManage || !treasurySeed()) return;
    setBusy("refresh");
    try {
      const wallet = await connectOrgWallet(treasurySeed()!);
      const [b, deposit, spark, txs] = await Promise.all([
        getOrgBalances(wallet),
        getOrgStaticDepositAddress(wallet),
        getOrgSparkAddress(wallet),
        getOrgTransfers(wallet).catch(() => []),
      ]);
      setBalances(b);
      setDepositAddress(deposit);
      setSparkAddress(spark);
      setTransfers(txs);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [canManage]);

  useEffect(() => {
    // Deferred to a microtask: state updates land outside the effect commit.
    if (org.seedUnlocked) void Promise.resolve().then(refresh);
  }, [org.seedUnlocked, refresh]);

  const vaultAddress = org.vault?.address;
  useEffect(() => {
    if (!vaultAddress) return;
    fetchAddressBalance(vaultAddress)
      .then(setVaultBalance)
      .catch(() => setVaultBalance(null));
    fetchUtxos(vaultAddress)
      .then((u) => setUtxoCount(u.length))
      .catch(() => setUtxoCount(0));
  }, [vaultAddress]);

  const unlock = async () => {
    if (!canManage) return;
    setBusy("unlock");
    try {
      await unlockTreasury();
      toast.success("Treasury unlocked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const total = (balances?.sats ?? 0n) + (vaultBalance ?? 0n);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif italic">Treasury</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Self-custodial Spark wallet + {org.config?.threshold ?? "M"}-of-{org.config?.vaultSigners.length ?? "N"} taproot vault.
          </p>
        </div>
        {canManage ? (
          org.seedUnlocked ? (
            <button
              onClick={refresh}
              disabled={busy === "refresh"}
              className="h-10 px-4 rounded-md border border-border bg-bg-elev-2/50 text-sm flex items-center gap-2 hover:border-border-bright transition"
            >
              <RefreshCw className={"h-4 w-4 " + (busy === "refresh" ? "animate-spin" : "")} /> Refresh
            </button>
          ) : (
            <button
              onClick={unlock}
              disabled={busy === "unlock"}
              className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90 transition"
            >
              <Unlock className="h-4 w-4" /> {busy === "unlock" ? "Decrypting…" : "Unlock treasury"}
            </button>
          )
        ) : (
          <span className="rounded-md border border-border bg-bg-elev-2/50 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Read only
          </span>
        )}
      </div>

      <OrgWalletNote org={org} />

      {!canManage && (
        <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5 text-sm text-muted-foreground flex items-start gap-3">
          <Lock className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <div>
            Members see the shared wallet and vault publicly. Only administrators unlock the Breez wallet to view
            live balances and transfers. To move funds, submit a proposal instead.
          </div>
        </div>
      )}

      {canManage && !org.seedUnlocked && (
        <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5 text-sm text-muted-foreground flex items-start gap-3">
          <Lock className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <div>
            The treasury is locked. Unlocking decrypts your NIP-44 wallet share (kind 30079) from your relays and
            connects the org Spark wallet locally. The seed stays in memory only.
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg border border-border bg-gradient-to-br from-bg-elev-1 to-bg-elev-2/30 p-6 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Total balance</div>
              <Bitcoin className="h-5 w-5 text-primary" />
            </div>
            <div className="mt-4 text-5xl font-mono font-semibold tracking-tight">
              {canManage ? `₿ ${(Number(total) / 1e8).toFixed(4)}` : "—"}
            </div>
            <div className="text-sm text-muted-foreground mt-1 font-mono">
              {!canManage
                ? "shared org wallet · balance visible to admins"
                : org.seedUnlocked
                  ? `${fmtSats(balances?.sats ?? 0n)} sats spark${vaultBalance !== null ? ` + ${fmtSats(vaultBalance)} sats vault` : ""}`
                  : "locked"}
            </div>
            {canManage && (
              <div className="mt-6 flex flex-wrap gap-2">
                <button onClick={() => document.getElementById("receive-panel")?.scrollIntoView({ behavior: "smooth" })}
                  className="h-10 px-4 rounded-md border border-border bg-bg-elev-2/50 text-sm flex items-center gap-2 hover:border-border-bright transition">
                  <ArrowDownRight className="h-4 w-4" /> Receive
                </button>
                <Link to="/app/payments" className="h-10 px-4 rounded-md border border-border bg-bg-elev-2/50 text-sm flex items-center gap-2 hover:border-border-bright transition">
                  <Zap className="h-4 w-4 text-[var(--yellow)]" /> Pay
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5 space-y-4">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            <Shield className="h-3.5 w-3.5 text-primary" /> Vault details
          </div>
          <div className="font-mono text-[12px] space-y-2">
            <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>Taproot multisig</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Threshold</span><span>{org.config?.threshold ?? "–"}-of-{org.config?.vaultSigners.length ?? "–"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">UTXOs</span><span>{utxoCount}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Balance</span><span>{vaultBalance !== null ? `${fmtSats(vaultBalance)} sats` : "unknown"}</span></div>
          </div>
          <div className="rounded-md border border-border bg-bg-elev-2/50 p-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5">Address</div>
            <div className="flex items-center gap-2">
              <code className="font-mono text-[11px] truncate flex-1">{org.vault?.address ?? "vault incomplete"}</code>
              {org.vault && (
                <button
                  onClick={() => copy(org.vault!.address)}
                  className="flex shrink-0 items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy address
                </button>
              )}
              {org.vault && <button onClick={() => window.open(explorerUiBase() + "/address/" + org.vault!.address, "_blank")} className="text-muted-foreground hover:text-primary transition"><ExternalLink className="h-3.5 w-3.5" /></button>}
            </div>
          </div>
          {!org.vaultComplete && (
            <div className="text-[11px] text-[var(--yellow)] font-mono">
              VAULT INCOMPLETE — NOT ENOUGH PUBLISHED SIGNER KEYS
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4" id="receive-panel">
        <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            <Bitcoin className="h-3.5 w-3.5 text-primary" /> Static deposit (L1)
          </div>
          <div className="mt-3 font-mono text-[11px] break-all">{depositAddress ?? "—"}</div>
          {depositAddress && (
            <button onClick={() => copy(depositAddress)} className="mt-3 text-xs text-primary hover:underline flex items-center gap-1">
              <Copy className="h-3 w-3" /> Copy address
            </button>
          )}
        </div>
        <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            <Zap className="h-3.5 w-3.5 text-[var(--yellow)]" /> Spark address
          </div>
          <div className="mt-3 font-mono text-[11px] break-all">{sparkAddress ?? "—"}</div>
          {sparkAddress && (
            <button onClick={() => copy(sparkAddress)} className="mt-3 text-xs text-primary hover:underline flex items-center gap-1">
              <Copy className="h-3 w-3" /> Copy address
            </button>
          )}
        </div>
        <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            <Coins className="h-3.5 w-3.5 text-primary" /> USDB balance
          </div>
          <div className="text-2xl font-semibold mt-3">{balances ? formatUsdb(balances.usdb) : "—"}</div>
          <div className="text-xs text-muted-foreground mt-1">stablecoin on Spark</div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-bg-elev-1/50">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="font-medium">Spark transfers</div>
          <div className="text-[11px] font-mono text-muted-foreground">recent wallet activity</div>
        </div>
        <div className="divide-y divide-border">
          {transfers.length === 0 && (
            <div className="px-5 py-6 text-sm text-muted-foreground">
              {!canManage
                ? "Transfers are visible to administrators."
                : org.seedUnlocked
                  ? "No transfers yet."
                  : "Unlock the treasury to see transfers."}
            </div>
          )}
          {transfers.slice(0, 15).map((t) => {
            const isOut = t.direction === "OUTGOING";
            return (
              <div key={t.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-bg-elev-2/40 transition">
                <div className={"h-8 w-8 rounded-full flex items-center justify-center " + (isOut ? "bg-primary/15 text-primary" : "bg-[var(--green)]/15 text-[var(--green)]")}>
                  {isOut ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t.type}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {t.status} · {t.createdAt ? new Date(t.createdAt * 1000).toLocaleString() : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono font-medium">{t.amount > 0n ? `${fmtSats(t.amount)} sats` : "—"}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
