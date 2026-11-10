import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Zap, Bitcoin, Send, Copy, Lock, Unlock, Coins, ArrowUpRight, ArrowDownRight, Receipt } from "lucide-react";
import type { WalletTransfer } from "@buildonspark/spark-sdk/types";
import { treasurySeed, unlockTreasury, useOrg } from "../../lib/org";
import {
  connectOrgWallet, createOrgLightningInvoice, getOrgBalances, getOrgTransfers,
  payOrgLightningInvoice, sendUsdb, withdrawOnchain, formatUsdb, type OrgBalances,
} from "../../lib/spark";

function fmtSats(n: bigint | number): string {
  return Number(n).toLocaleString("en-US");
}

type Mode = "lightning" | "usdb" | "onchain";

export function PaymentsPage() {
  const org = useOrg();
  const [balances, setBalances] = useState<OrgBalances | null>(null);
  const [transfers, setTransfers] = useState<WalletTransfer[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("lightning");
  // lightning pay
  const [invoice, setInvoice] = useState("");
  const [maxFee, setMaxFee] = useState("");
  // lightning receive
  const [recvAmount, setRecvAmount] = useState("");
  const [recvMemo, setRecvMemo] = useState("");
  const [recvInvoice, setRecvInvoice] = useState<string | null>(null);
  // usdb
  const [usdbAddress, setUsdbAddress] = useState("");
  const [usdbAmount, setUsdbAmount] = useState("");
  // on-chain
  const [btcAddress, setBtcAddress] = useState("");
  const [btcAmount, setBtcAmount] = useState("");

  const refresh = useCallback(async () => {
    if (!treasurySeed()) return;
    try {
      const wallet = await connectOrgWallet(treasurySeed()!);
      const [b, txs] = await Promise.all([
        getOrgBalances(wallet),
        getOrgTransfers(wallet).catch(() => []),
      ]);
      setBalances(b);
      setTransfers(txs);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    // Deferred to a microtask: state updates land outside the effect commit.
    if (org.seedUnlocked) void Promise.resolve().then(refresh);
  }, [org.seedUnlocked, refresh]);

  const unlock = async () => {
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

  const run = async (key: string, label: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      toast.success(label);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const payInvoice = () =>
    run("pay", "Invoice paid", async () => {
      const wallet = await connectOrgWallet(treasurySeed()!);
      await payOrgLightningInvoice(wallet, invoice.trim(), maxFee ? Number(maxFee) : undefined);
      setInvoice("");
    });

  const createInvoice = () =>
    run("recv", "Invoice created", async () => {
      const wallet = await connectOrgWallet(treasurySeed()!);
      const res = await createOrgLightningInvoice(
        wallet,
        Number(recvAmount),
        recvMemo.trim() || undefined,
      );
      setRecvInvoice(res.invoice);
    });

  const sendUsdbTx = () =>
    run("usdb", "USDB sent", async () => {
      const wallet = await connectOrgWallet(treasurySeed()!);
      await sendUsdb(wallet, usdbAddress.trim(), Number(usdbAmount));
      setUsdbAddress("");
      setUsdbAmount("");
    });

  const withdraw = () =>
    run("onchain", "Withdrawal requested", async () => {
      const wallet = await connectOrgWallet(treasurySeed()!);
      await withdrawOnchain(wallet, btcAddress.trim(), Number(btcAmount));
      setBtcAddress("");
      setBtcAmount("");
    });

  const inputCls =
    "w-full h-10 rounded-md border border-border bg-bg-elev-2/50 px-3 text-sm font-mono focus:outline-none focus:border-primary/60 transition";

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif italic">Payments</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pay contributors instantly with Lightning, USDB over Spark, or settle large amounts on-chain.</p>
        </div>
        {!org.seedUnlocked && (
          <button
            onClick={unlock}
            disabled={busy === "unlock"}
            className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90 transition"
          >
            <Unlock className="h-4 w-4" /> {busy === "unlock" ? "Decrypting…" : "Unlock treasury"}
          </button>
        )}
      </div>

      {!org.seedUnlocked && (
        <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5 text-sm text-muted-foreground flex items-start gap-3">
          <Lock className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <div>The treasury is locked. Unlock it to pay Lightning invoices, send USDB, or withdraw on-chain.</div>
        </div>
      )}

      {org.seedUnlocked && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5">
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                <Bitcoin className="h-3.5 w-3.5 text-primary" /> Spark sats
              </div>
              <div className="text-2xl font-mono font-semibold mt-3">{fmtSats(balances?.sats ?? 0n)}</div>
              <div className="text-xs text-muted-foreground mt-1">instant transfers + lightning</div>
            </div>
            <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5">
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                <Coins className="h-3.5 w-3.5 text-primary" /> USDB
              </div>
              <div className="text-2xl font-mono font-semibold mt-3">{balances ? formatUsdb(balances.usdb) : "—"}</div>
              <div className="text-xs text-muted-foreground mt-1">dollar-stable token on Spark</div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg-elev-1/50 overflow-hidden">
            <div className="flex items-center gap-1 px-2 pt-2 border-b border-border flex-wrap">
              {(
                [
                  ["lightning", "Lightning", Zap],
                  ["usdb", "USDB send", Coins],
                  ["onchain", "On-chain withdraw", Bitcoin],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => setMode(key)}
                  className={
                    "h-9 px-4 rounded-t-md text-xs font-mono uppercase tracking-wider flex items-center gap-2 border-b-2 -mb-px transition " +
                    (mode === key
                      ? "border-primary text-foreground bg-bg-elev-2/60"
                      : "border-transparent text-muted-foreground hover:text-foreground")
                  }
                >
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>

            <div className="p-5 space-y-4">
              {mode === "lightning" && (
                <>
                  <div>
                    <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Pay a BOLT-11 invoice</label>
                    <div className="mt-1.5 flex gap-2">
                      <input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="lnbc…" className={inputCls} />
                      <button
                        onClick={payInvoice}
                        disabled={busy === "pay" || !invoice.trim()}
                        className="h-10 px-4 shrink-0 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:opacity-90 transition disabled:opacity-50"
                      >
                        <Send className="h-4 w-4" /> {busy === "pay" ? "Paying…" : "Pay"}
                      </button>
                    </div>
                    <div className="mt-2">
                      <input value={maxFee} onChange={(e) => setMaxFee(e.target.value)} placeholder="max fee (sats, optional)" className={inputCls} />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-border">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Create an invoice (receive)</label>
                    <div className="mt-1.5 flex gap-2 flex-wrap">
                      <input value={recvAmount} onChange={(e) => setRecvAmount(e.target.value)} placeholder="amount (sats)" className={inputCls + " flex-1 min-w-32"} />
                      <input value={recvMemo} onChange={(e) => setRecvMemo(e.target.value)} placeholder="memo (optional)" className={inputCls + " flex-1 min-w-32"} />
                      <button
                        onClick={createInvoice}
                        disabled={busy === "recv" || !recvAmount.trim()}
                        className="h-10 px-4 shrink-0 rounded-md border border-border text-sm hover:border-border-bright transition disabled:opacity-50"
                      >
                        {busy === "recv" ? "Creating…" : "Create invoice"}
                      </button>
                    </div>
                    {recvInvoice && (
                      <div className="mt-3 rounded-md border border-border bg-bg-elev-2/50 p-3">
                        <div className="font-mono text-[11px] break-all select-all">{recvInvoice}</div>
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(recvInvoice);
                            toast.success("Copied to clipboard");
                          }}
                          className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <Copy className="h-3 w-3" /> Copy invoice
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}

              {mode === "usdb" && (
                <div className="space-y-3 max-w-xl">
                  <div>
                    <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Recipient spark address</label>
                    <input value={usdbAddress} onChange={(e) => setUsdbAddress(e.target.value)} placeholder="sp1p… or tsp1p…" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Amount (USD)</label>
                    <input value={usdbAmount} onChange={(e) => setUsdbAmount(e.target.value)} placeholder="420.00" inputMode="decimal" className={inputCls} />
                  </div>
                  <button
                    onClick={sendUsdbTx}
                    disabled={busy === "usdb" || !usdbAddress.trim() || !usdbAmount.trim()}
                    className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:opacity-90 transition disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" /> {busy === "usdb" ? "Sending…" : "Send USDB"}
                  </button>
                </div>
              )}

              {mode === "onchain" && (
                <div className="space-y-3 max-w-xl">
                  <div>
                    <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Bitcoin address</label>
                    <input value={btcAddress} onChange={(e) => setBtcAddress(e.target.value)} placeholder="bc1…" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Amount (sats)</label>
                    <input value={btcAmount} onChange={(e) => setBtcAmount(e.target.value)} placeholder="100000" inputMode="numeric" className={inputCls} />
                  </div>
                  <button
                    onClick={withdraw}
                    disabled={busy === "onchain" || !btcAddress.trim() || !btcAmount.trim()}
                    className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:opacity-90 transition disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" /> {busy === "onchain" ? "Requesting…" : "Withdraw on-chain"}
                  </button>
                  <p className="text-[11px] text-muted-foreground-2">
                    Cooperative exit from Spark to L1. Uses the default exit speed (FAST); fees are quoted by the network.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg-elev-1/50">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="font-medium flex items-center gap-2"><Receipt className="h-4 w-4 text-muted-foreground" /> Payment history</div>
              <div className="text-[11px] font-mono text-muted-foreground">spark wallet transfers</div>
            </div>
            <div className="divide-y divide-border">
              {transfers.length === 0 && (
                <div className="px-5 py-6 text-sm text-muted-foreground">No transfers yet.</div>
              )}
              {transfers.slice(0, 15).map((t) => {
                const isOut = t.transferDirection === "OUTGOING";
                const sats = isOut ? t.valueSentByWallet : t.valueReceivedByWallet;
                return (
                  <div key={t.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-bg-elev-2/40 transition">
                    <div className={"h-8 w-8 rounded-full flex items-center justify-center " + (isOut ? "bg-primary/15 text-primary" : "bg-[var(--green)]/15 text-[var(--green)]")}>
                      {isOut ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{String(t.type).toLowerCase()}</div>
                      <div className="text-[11px] text-muted-foreground font-mono truncate">
                        {String(t.status)} · {t.createdTime ? new Date(t.createdTime).toLocaleString() : t.id.slice(0, 16)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono font-medium">{sats > 0 ? `${fmtSats(BigInt(sats))} sats` : "—"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
