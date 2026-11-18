import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Zap, Bitcoin, Send, Copy, Lock, Unlock, Coins, ArrowUpRight, ArrowDownRight,
  Receipt, CheckCircle2, ArrowRight,
} from "lucide-react";
import { executeApprovedPayment } from "../../lib/autoPay";
import { payPlatformFee, platformFeeDisplay } from "../../lib/fees";
import {
  approvedPaymentProposals, paymentMatchesProposal, proposalPaymentMethod,
  recordPaymentExecution, requireApprovedPayment, treasurySeed, unlockTreasury, useOrg,
  type PaymentMethod, type ProposalView,
} from "../../lib/org";
import {
  connectOrgWallet, createOrgLightningInvoice, getOrgBalances, getOrgTransfers,
  payOrgLightningInvoice, sendUsdb, withdrawOnchain, formatUsdb,
  type OrgBalances, type OrgTransfer,
} from "../../lib/spark";
import { OrgWalletNote } from "../../components/OrgWalletNote";

function fmtSats(n: bigint | number): string {
  return Number(n).toLocaleString("en-US");
}

const paymentLabels: Record<PaymentMethod, string> = {
  lightning: "Lightning",
  usdb: "USDB",
  onchain: "On-chain",
};

function proposalAmountLabel(proposal: ProposalView): string {
  if (proposalPaymentMethod(proposal) === "usdb") {
    return proposal.amountUsd != null ? `${Number(proposal.amountUsd).toLocaleString("en-US")} USD` : "amount in address";
  }
  return proposal.amountSats != null ? `${Number(proposal.amountSats).toLocaleString("en-US")} sats` : "amount in invoice";
}

function LockedPayment({ method }: { method: PaymentMethod }) {
  return (
    <div className="rounded-md border border-border bg-bg-elev-2/30 px-5 py-8 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary-dim text-primary">
        <Lock className="h-4 w-4" />
      </div>
      <div className="mt-3 text-sm font-medium">Payments are locked</div>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
        Create a {paymentLabels[method]} payment proposal and collect the required votes. This form unlocks automatically when the proposal passes.
      </p>
      <Link
        to="/app/proposals"
        className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-border px-4 text-xs text-primary hover:border-border-bright"
      >
        Review proposals <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

type Mode = "lightning" | "usdb" | "onchain";

export function PaymentsPage() {
  const org = useOrg();
  const canManage = org.myRole === "admin";
  const [balances, setBalances] = useState<OrgBalances | null>(null);
  const [transfers, setTransfers] = useState<OrgTransfer[]>([]);
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
  const [selectedProposalId, setSelectedProposalId] = useState("");

  // All outbound payments are authorized by a passed Nostr proposal.
  const approvedProposals = approvedPaymentProposals();
  const approvedForMode = approvedProposals.filter((p) => proposalPaymentMethod(p) === mode);
  const selectedApproved =
    approvedForMode.find((p) => p.id === selectedProposalId) ?? approvedForMode[0] ?? null;
  const feeLabel = selectedApproved
    ? platformFeeDisplay(
        proposalPaymentMethod(selectedApproved),
        selectedApproved.amountSats,
        selectedApproved.amountUsd,
      )
    : null;

  // Start from the exact recipient and amount the council approved. Deferred
  // so relay-driven state updates don't trigger a synchronous render cascade.
  useEffect(() => {
    if (!selectedApproved) return;
    void Promise.resolve().then(() => {
      const recipient = selectedApproved.payee ?? selectedApproved.onchainAddress ?? "";
      if (mode === "lightning") {
        setInvoice(recipient);
        setMaxFee("");
      } else if (mode === "usdb") {
        setUsdbAddress(recipient);
        setUsdbAmount(selectedApproved.amountUsd != null ? String(selectedApproved.amountUsd) : "");
      } else {
        setBtcAddress(recipient);
        setBtcAmount(selectedApproved.amountSats != null ? String(selectedApproved.amountSats) : "");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedApproved?.id, mode]);

  const refresh = useCallback(async () => {
    if (!canManage || !treasurySeed()) return;
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
  }, [canManage]);

  useEffect(() => {
    // Deferred to a microtask: state updates land outside the effect commit.
    if (org.seedUnlocked) void Promise.resolve().then(refresh);
  }, [org.seedUnlocked, refresh]);

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

  const run = async (key: string, label: string, fn: () => Promise<unknown>) => {
    if (!canManage) return;
    if (!treasurySeed()) return toast.error("Unlock the treasury first");
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

  /** Outbound money movement requires a passed proposal and records the payment on Nostr. */
  const runApprovedPayment = async (
    key: string,
    label: string,
    recipient: string,
    amount: number | undefined,
    pay: () => Promise<string>,
  ) => {
    if (!canManage) return;
    if (!selectedApproved) return toast.error("A passed payment proposal is required");
    if (!paymentMatchesProposal(selectedApproved, { recipient, amount })) {
      return toast.error("Recipient or amount no longer matches the approved proposal");
    }
    if (!treasurySeed()) return toast.error("Unlock the treasury first");

    setBusy(key);
    try {
      const authorized = requireApprovedPayment(mode, recipient, amount);
      if (authorized.id !== selectedApproved.id) {
        throw new Error("This payment is covered by a different approved proposal");
      }
      const reference = await pay();
      try {
        const wallet = await connectOrgWallet(treasurySeed()!);
        await payPlatformFee(
          wallet,
          mode,
          mode === "usdb" ? null : selectedApproved.amountSats ?? amount,
          mode === "usdb" ? amount : null,
        );
      } catch (error) {
        toast.error(
          `Payment sent, but the platform fee failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      await recordPaymentExecution(authorized, reference);
      toast.success(label);
      if (mode === "lightning") setInvoice("");
      else if (mode === "usdb") {
        setUsdbAddress("");
        setUsdbAmount("");
      } else {
        setBtcAddress("");
        setBtcAmount("");
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  /** One-click fallback: submit the approved proposal exactly as voted on. */
  const makePayment = async () => {
    if (!selectedApproved) return;
    setBusy("make");
    try {
      const reference = await executeApprovedPayment(selectedApproved, org.vaultComplete);
      toast.success(`Payment sent · ${reference.slice(0, 16)}…`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const payInvoice = () =>
    selectedApproved &&
    runApprovedPayment("pay", "Invoice paid", invoice.trim(), undefined, async () => {
      const wallet = await connectOrgWallet(treasurySeed()!);
      const paid = await payOrgLightningInvoice(
        wallet,
        invoice.trim(),
        maxFee ? Number(maxFee) : undefined,
        selectedApproved?.amountSats ?? undefined,
      );
      return paid.id;
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
    selectedApproved &&
    runApprovedPayment("usdb", "USDB sent", usdbAddress.trim(), Number(usdbAmount), async () => {
      const wallet = await connectOrgWallet(treasurySeed()!);
      return sendUsdb(wallet, usdbAddress.trim(), Number(usdbAmount));
    });

  const withdraw = () =>
    selectedApproved &&
    runApprovedPayment("onchain", "Withdrawal requested", btcAddress.trim(), Number(btcAmount), async () => {
      const wallet = await connectOrgWallet(treasurySeed()!);
      return withdrawOnchain(wallet, btcAddress.trim(), Number(btcAmount));
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
        {canManage && !org.seedUnlocked && (
          <button
            onClick={unlock}
            disabled={busy === "unlock"}
            className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90 transition"
          >
            <Unlock className="h-4 w-4" /> {busy === "unlock" ? "Decrypting…" : "Unlock treasury"}
          </button>
        )}
      </div>

      <OrgWalletNote org={org} />

      {canManage && (
        <div
          className={
            "rounded-lg border p-5 flex flex-wrap items-center justify-between gap-4 " +
            (selectedApproved
              ? "border-[var(--green)]/30 bg-[var(--green)]/10"
              : "border-[var(--yellow)]/30 bg-[var(--yellow)]/10")
          }
        >
          <div className="flex min-w-0 items-start gap-3">
            {selectedApproved ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--green)]" />
            ) : (
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--yellow)]" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium">
                {selectedApproved ? `${paymentLabels[mode]} payment approved` : "Payments are locked"}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {selectedApproved
                  ? `Authorized by “${selectedApproved.title}” · ${proposalAmountLabel(selectedApproved)}. Submitted automatically when the proposal passes${feeLabel ? ` · ${feeLabel}` : ""} — use the button below if it did not go through.`
                  : `A passed ${paymentLabels[mode]} proposal is required before funds can move.`}
              </div>
              {approvedForMode.length > 0 && (
                <select
                  value={selectedApproved?.id ?? ""}
                  onChange={(e) => setSelectedProposalId(e.target.value)}
                  className="mt-3 h-9 max-w-full rounded-md border border-border bg-bg-elev-2/60 px-3 text-xs text-foreground focus:outline-none focus:border-primary/60"
                >
                  {approvedForMode.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} · {proposalAmountLabel(p)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedApproved && (
              <button
                type="button"
                onClick={makePayment}
                disabled={busy === "make"}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-xs font-medium flex items-center gap-2 hover:opacity-90 transition disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" /> {busy === "make" ? "Sending…" : "Make the payment"}
              </button>
            )}
            <Link
              to="/app/proposals"
              className="h-9 px-4 rounded-md border border-border text-xs text-primary hover:border-border-bright transition flex items-center gap-2"
            >
              Review proposals <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}

      {!canManage && (
        <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5 text-sm text-muted-foreground flex items-start gap-3">
          <Lock className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <div>
            Payments are read-only for members. Every payment needs an approved proposal; admins can execute it
            only after it passes.
          </div>
        </div>
      )}

      {canManage && !org.seedUnlocked && (
        <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5 text-sm text-muted-foreground flex items-start gap-3">
          <Lock className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <div>
            The treasury is locked. Unlock it to view balances; payments also need a passed proposal.
          </div>
        </div>
      )}

      {canManage && org.seedUnlocked && (
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
                  {selectedApproved ? (
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
                      <p className="mt-2 text-[11px] text-muted-foreground-2">
                        The invoice was filled from the approved proposal. Changing it will block the payment.
                      </p>
                    </div>
                  ) : (
                    <LockedPayment method="lightning" />
                  )}

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
                selectedApproved ? (
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
                    <p className="text-[11px] text-muted-foreground-2">
                      Recipient and amount come from the approved proposal. Changing them will block the payment.
                    </p>
                  </div>
                ) : (
                  <LockedPayment method="usdb" />
                )
              )}

              {mode === "onchain" && (
                selectedApproved ? (
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
                      Recipient and amount come from the approved proposal. Changing them will block the payment.
                      Cooperative exit from Spark to L1 uses the default FAST speed; fees are quoted by the network.
                    </p>
                  </div>
                ) : (
                  <LockedPayment method="onchain" />
                )
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
                const isOut = t.direction === "OUTGOING";
                return (
                  <div key={t.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-bg-elev-2/40 transition">
                    <div className={"h-8 w-8 rounded-full flex items-center justify-center " + (isOut ? "bg-primary/15 text-primary" : "bg-[var(--green)]/15 text-[var(--green)]")}>
                      {isOut ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{t.type}</div>
                      <div className="text-[11px] text-muted-foreground font-mono truncate">
                        {t.status} · {t.createdAt ? new Date(t.createdAt * 1000).toLocaleString() : t.id.slice(0, 16)}
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
        </>
      )}
    </div>
  );
}
