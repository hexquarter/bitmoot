import { useState } from "react";
import { toast } from "sonner";
import { Plus, Vote, CheckCircle2, Clock, Gavel, Send, FileSignature, ExternalLink } from "lucide-react";
import { useAuth } from "../../lib/auth";
import {
  castVote, createProposal, createVaultSpend, cosignVaultSpend, executeVaultSpend,
  shortNpub, useOrg, type ProposalView, type VoteChoice,
} from "../../lib/org";
import { explorerUiBase } from "../../lib/vault";

const statusStyle: Record<string, string> = {
  voting: "border-primary/30 text-primary bg-primary-dim",
  passed: "border-[var(--green)]/30 text-[var(--green)] bg-[var(--green)]/10",
  executed: "border-[var(--blue)]/30 text-[var(--blue)] bg-[var(--blue)]/10",
};

const statusIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  voting: Vote,
  passed: CheckCircle2,
  executed: Clock,
};

type Filter = "all" | "open" | "passed" | "executed";

function NewProposal({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<"payment" | "general">("payment");
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) return toast.error("Give the proposal a title");
    setBusy(true);
    try {
      await createProposal({
        title: title.trim(),
        body: body.trim(),
        type,
        amountSats: type === "payment" ? Number(amount) || undefined : undefined,
        onchainAddress: type === "payment" ? address.trim() || undefined : undefined,
      });
      toast.success("Proposal published to Nostr");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full h-10 rounded-md border border-border bg-bg-elev-2/50 px-3 text-sm focus:outline-none focus:border-primary/60 transition";

  return (
    <div className="rounded-lg border border-border bg-bg-elev-1/50 p-6 space-y-4 max-w-2xl">
      <div className="flex items-center gap-2 font-medium"><Plus className="h-4 w-4 text-primary" /> New proposal</div>
      <div>
        <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pay Lina for the mixing studio"
          className={inputCls} />
      </div>
      <div>
        <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Body</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Context for the council…"
          className="w-full rounded-md border border-border bg-bg-elev-2/50 px-3 py-2 text-sm focus:outline-none focus:border-primary/60 transition resize-none" />
      </div>
      <div className="flex gap-2">
        {(["payment", "general"] as const).map((t) => (
          <button key={t} onClick={() => setType(t)}
            className={"h-9 px-4 rounded-md text-xs font-mono uppercase tracking-wider border transition " +
              (type === t ? "border-primary/50 bg-primary-dim text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
            {t}
          </button>
        ))}
      </div>
      {type === "payment" && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Amount (sats)</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="4200000"
              className={inputCls + " font-mono"} />
          </div>
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">On-chain address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="bc1…"
              className={inputCls + " font-mono"} />
          </div>
        </div>
      )}
      <button onClick={submit} disabled={busy}
        className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90 transition disabled:opacity-50">
        <Send className="h-4 w-4" /> {busy ? "Publishing…" : "Publish proposal"}
      </button>
    </div>
  );
}

function VoteButtons({ proposal, voted }: { proposal: ProposalView; voted: VoteChoice | null }) {
  const [busy, setBusy] = useState<string | null>(null);
  const vote = async (choice: VoteChoice) => {
    setBusy(choice);
    try {
      await castVote(proposal.id, choice);
      toast.success(`Voted ${choice}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex gap-1.5">
      {(["yes", "no", "abstain"] as const).map((c) => (
        <button key={c} onClick={() => vote(c)} disabled={busy !== null}
          className={"h-7 px-2.5 rounded text-[10px] font-mono uppercase tracking-wider border transition disabled:opacity-50 " +
            (voted === c
              ? "border-primary/60 bg-primary-dim text-primary"
              : "border-border text-muted-foreground hover:text-foreground hover:border-border-bright")}>
          {busy === c ? "…" : c}
        </button>
      ))}
    </div>
  );
}

function SpendActions({ proposal }: { proposal: ProposalView }) {
  const org = useOrg();
  const [busy, setBusy] = useState<string | null>(null);
  const threshold = org.config?.threshold ?? 0;

  const create = async () => {
    setBusy("create");
    try {
      await createVaultSpend(proposal);
      toast.success("PSBT built, signed and published for co-signing");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const cosign = async () => {
    setBusy("cosign");
    try {
      await cosignVaultSpend(proposal);
      toast.success("Co-signature published");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const execute = async () => {
    setBusy("execute");
    try {
      const txid = await executeVaultSpend(proposal);
      toast.success(`Broadcast: ${txid}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const btn =
    "h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-50";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {proposal.psbtSigs === 0 ? (
        <button onClick={create} disabled={busy !== null}
          className={btn + " border border-border text-foreground hover:border-border-bright"}>
          <FileSignature className="h-3.5 w-3.5" /> {busy === "create" ? "Building…" : "Prepare vault spend"}
        </button>
      ) : (
        <>
          <button onClick={cosign} disabled={busy !== null}
            className={btn + " border border-border text-foreground hover:border-border-bright"}>
            <FileSignature className="h-3.5 w-3.5" /> {busy === "cosign" ? "Signing…" : "Co-sign"}
          </button>
          <button onClick={execute} disabled={busy !== null}
            className={btn + " bg-primary text-primary-foreground hover:opacity-90"}>
            <Send className="h-3.5 w-3.5" /> {busy === "execute" ? "Broadcasting…" : "Execute"}
          </button>
          <span className="text-[10px] font-mono text-muted-foreground-2">{proposal.psbtSigs} co-signed</span>
        </>
      )}
      {proposal.psbtSigs > 0 && proposal.psbtSigs < threshold && (
        <span className="text-[10px] font-mono text-[var(--yellow)]">needs {threshold - proposal.psbtSigs} more</span>
      )}
    </div>
  );
}

export function ProposalsPage() {
  const org = useOrg();
  const auth = useAuth().signer;
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);

  const isCouncil = Boolean(auth && org.config?.council.includes(auth.pubkey));
  const threshold = org.config?.threshold ?? 0;

  const proposals = org.proposals.filter((p) => {
    if (filter === "open") return !p.passed && !p.executed;
    if (filter === "passed") return p.passed && !p.executed;
    if (filter === "executed") return p.executed;
    return true;
  });

  const myVote = (p: ProposalView): VoteChoice | null => {
    if (!auth) return null;
    const v = p.votes.find((v) => v.author === auth.pubkey);
    return v?.choice ?? null;
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif italic">Proposals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed via Nostr (kind 37000 + votes), settled by {threshold || "M"}-of-{org.config?.vaultSigners.length ?? "N"} taproot multisig.
          </p>
        </div>
        <button
          onClick={() => setShowNew((s) => !s)}
          className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90 transition"
        >
          <Plus className="h-4 w-4" /> New proposal
        </button>
      </div>

      {showNew && <NewProposal onDone={() => setShowNew(false)} />}

      <div className="flex items-center gap-2 flex-wrap">
        {(
          [
            ["all", "All"],
            ["open", "Voting"],
            ["passed", "Passed"],
            ["executed", "Executed"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={
              "h-8 px-3 rounded-md text-xs font-mono uppercase tracking-wider border transition " +
              (filter === key
                ? "bg-bg-elev-2 border-border-bright text-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-border-bright")
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-bg-elev-1/50 overflow-hidden">
        <div className="hidden md:grid grid-cols-12 px-5 py-3 border-b border-border text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-bg-elev-2/40">
          <div className="col-span-1">ID</div>
          <div className="col-span-5">Proposal</div>
          <div className="col-span-3">Votes</div>
          <div className="col-span-2">Quorum</div>
          <div className="col-span-1 text-right">Status</div>
        </div>
        <div className="divide-y divide-border">
          {proposals.length === 0 && (
            <div className="px-5 py-6 text-sm text-muted-foreground">
              {org.loading ? "Loading proposals from relays…" : "No proposals yet — create the first one."}
            </div>
          )}
          {proposals.map((p) => {
            const status = p.executed ? "executed" : p.passed ? "passed" : "voting";
            const Icon = statusIcon[status];
            const yesPct = Math.min(100, (p.yesCount / Math.max(1, threshold)) * 100);
            return (
              <div key={p.id} className="px-5 py-4 grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 items-center hover:bg-bg-elev-2/40 transition">
                <div className="md:col-span-1 font-mono text-[11px] text-muted-foreground-2">{p.id.slice(0, 8)}</div>
                <div className="md:col-span-5 min-w-0">
                  <button onClick={() => setOpen(open === p.id ? null : p.id)} className="text-left w-full">
                    <div className="text-sm font-medium truncate">{p.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      by {shortNpub(p.author)} · {new Date(p.createdAt * 1000).toLocaleDateString()}
                      {p.type === "payment" && p.amountSats != null && (
                        <span className="text-primary"> · {Number(p.amountSats).toLocaleString("en-US")} sats</span>
                      )}
                    </div>
                  </button>
                  {open === p.id && (
                    <div className="mt-2 space-y-2">
                      {p.body && <p className="text-xs text-muted-foreground whitespace-pre-line">{p.body}</p>}
                      {p.type === "payment" && (
                        <div className="font-mono text-[11px] text-muted-foreground-2 break-all">
                          → {p.onchainAddress ?? "no address"}
                        </div>
                      )}
                      {p.votes.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {p.votes.map((v) => (
                            <span key={v.author} className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-bg-elev-2/50">
                              {shortNpub(v.author)}: {v.choice}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="md:col-span-3 font-mono text-[11px] text-muted-foreground flex items-center gap-3">
                  <span className="text-[var(--green)]">{p.yesCount} yes</span>
                  <span className="text-destructive">{p.noCount} no</span>
                  <span>{p.votes.length - p.yesCount - p.noCount} abs</span>
                </div>
                <div className="md:col-span-2">
                  <div className="h-1.5 rounded-full bg-bg-elev-2 overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${yesPct}%` }} />
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground-2 mt-1">{p.yesCount}/{threshold} council yes</div>
                </div>
                <div className="md:col-span-1 flex md:justify-end">
                  <span className={"text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border flex items-center gap-1 " + statusStyle[status]}>
                    <Icon className="h-3 w-3" /> {status}
                  </span>
                </div>
                <div className="md:col-span-12 flex items-center gap-3 flex-wrap">
                  {!p.executed && isCouncil && !p.passed && <VoteButtons proposal={p} voted={myVote(p)} />}
                  {p.passed && !p.executed && p.type === "payment" && org.vaultComplete && p.onchainAddress && p.amountSats != null && (
                    <SpendActions proposal={p} />
                  )}
                  {p.passed && !p.executed && !(p.type === "payment" && org.vaultComplete && p.onchainAddress && p.amountSats != null) && (
                    <span className="text-[10px] font-mono text-muted-foreground-2 flex items-center gap-1">
                      <Gavel className="h-3 w-3" /> passed — awaiting multisig execution
                    </span>
                  )}
                  {p.executed && p.execution && (
                    <a
                      href={`${explorerUiBase()}/tx/${p.execution.txid}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-mono text-primary hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" /> {p.execution.txid.slice(0, 16)}…
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
