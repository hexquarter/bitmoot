import { Plus, Filter, Vote, CheckCircle2, Clock, XCircle } from "lucide-react";

const proposals = [
  { id: "PROP-014", title: "Q3 grant: Nostr client localization", author: "@lina", yes: 4, no: 2, abstain: 1, quorum: 67, status: "voting", time: "2d left" },
  { id: "PROP-013", title: "Approve $4,200 to Lina (mixing studio)", author: "@marc", yes: 8, no: 0, abstain: 1, quorum: 92, status: "voting", time: "12h left" },
  { id: "PROP-012", title: "Add Marc as 5th signer", author: "@satoshi", yes: 9, no: 0, abstain: 0, quorum: 100, status: "queued", time: "Awaiting broadcast" },
  { id: "PROP-011", title: "Migrate treasury to taproot vault", author: "@satoshi", yes: 11, no: 1, abstain: 0, quorum: 100, status: "passed", time: "Settled block 901,201" },
  { id: "PROP-010", title: "Sponsor Bitcoin++ conference booth", author: "@kai", yes: 3, no: 7, abstain: 2, quorum: 100, status: "rejected", time: "Closed 5d ago" },
];

const statusStyle: Record<string, string> = {
  voting: "border-primary/30 text-primary bg-primary-dim",
  queued: "border-[var(--yellow)]/30 text-[var(--yellow)] bg-[var(--yellow)]/10",
  passed: "border-[var(--green)]/30 text-[var(--green)] bg-[var(--green)]/10",
  rejected: "border-destructive/30 text-destructive bg-destructive/10",
};

const statusIcon: Record<string, any> = {
  voting: Vote,
  queued: Clock,
  passed: CheckCircle2,
  rejected: XCircle,
};

export function ProposalsPage() {
  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif italic">Proposals</h1>
          <p className="mt-1 text-sm text-muted-foreground">Signed via Nostr (kind 30050-30054), settled by 3-of-5 taproot multisig.</p>
        </div>
        <button className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90 transition">
          <Plus className="h-4 w-4" /> New proposal
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {["All", "Voting", "Queued", "Passed", "Rejected"].map((t, i) => (
          <button
            key={t}
            className={
              "h-8 px-3 rounded-md text-xs font-mono uppercase tracking-wider border transition " +
              (i === 0
                ? "bg-bg-elev-2 border-border-bright text-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-border-bright")
            }
          >
            {t}
          </button>
        ))}
        <button className="ml-auto h-8 px-3 rounded-md text-xs border border-border text-muted-foreground hover:text-foreground hover:border-border-bright flex items-center gap-1.5 transition">
          <Filter className="h-3.5 w-3.5" /> Filter
        </button>
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
          {proposals.map((p) => {
            const Icon = statusIcon[p.status];
            const total = p.yes + p.no + p.abstain;
            const yesPct = (p.yes / total) * 100;
            return (
              <div key={p.id} className="px-5 py-4 grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 items-center hover:bg-bg-elev-2/40 transition cursor-pointer">
                <div className="md:col-span-1 font-mono text-[11px] text-muted-foreground-2">{p.id}</div>
                <div className="md:col-span-5 min-w-0">
                  <div className="text-sm font-medium truncate">{p.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">by {p.author} · {p.time}</div>
                </div>
                <div className="md:col-span-3 font-mono text-[11px] text-muted-foreground flex items-center gap-3">
                  <span className="text-[var(--green)]">{p.yes} yes</span>
                  <span className="text-destructive">{p.no} no</span>
                  <span>{p.abstain} abs</span>
                </div>
                <div className="md:col-span-2">
                  <div className="h-1.5 rounded-full bg-bg-elev-2 overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${yesPct}%` }} />
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground-2 mt-1">{p.quorum}%</div>
                </div>
                <div className="md:col-span-1 flex md:justify-end">
                  <span className={"text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border flex items-center gap-1 " + statusStyle[p.status]}>
                    <Icon className="h-3 w-3" /> {p.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}