import { Zap, Bitcoin, Send, Plus, Clock, CheckCircle2 } from "lucide-react";
const payments = [
  { to: "@lina", desc: "Mixing studio · PROP-013", method: "onchain", amount: "0.0631 BTC", usd: "$4,200", status: "settled", time: "6h ago" },
  { to: "@marc", desc: "Bug bounty · auth flow", method: "lightning", amount: "120,000 sat", usd: "$80", status: "settled", time: "1d ago" },
  { to: "@yuki", desc: "October stipend", method: "lightning", amount: "300,000 sat", usd: "$200", status: "settled", time: "2d ago" },
  { to: "@pablo", desc: "Translation contract", method: "onchain", amount: "0.0150 BTC", usd: "$998", status: "broadcasting", time: "now" },
  { to: "@nina", desc: "Recurring · monthly contributor", method: "lightning", amount: "500,000 sat", usd: "$333", status: "scheduled", time: "in 3d" },
];

const statusStyle: Record<string, string> = {
  settled: "border-[var(--green)]/30 text-[var(--green)] bg-[var(--green)]/10",
  broadcasting: "border-primary/30 text-primary bg-primary-dim",
  scheduled: "border-[var(--yellow)]/30 text-[var(--yellow)] bg-[var(--yellow)]/10",
};

export function PaymentsPage() {
  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif italic">Payments</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pay contributors instantly with Lightning, large amounts on-chain.</p>
        </div>
        <div className="flex gap-2">
          <button className="h-10 px-4 rounded-md border border-border bg-bg-elev-2/50 text-sm flex items-center gap-2 hover:border-border-bright transition">
            <Plus className="h-4 w-4" /> Schedule payroll
          </button>
          <button className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90 transition">
            <Send className="h-4 w-4" /> New payment
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            <Bitcoin className="h-3.5 w-3.5 text-primary" /> On-chain (30d)
          </div>
          <div className="text-2xl font-semibold mt-3">$18,420</div>
          <div className="text-xs text-muted-foreground mt-1">8 transactions · ₿ 0.277</div>
        </div>
        <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            <Zap className="h-3.5 w-3.5 text-[var(--yellow)]" /> Lightning (30d)
          </div>
          <div className="text-2xl font-semibold mt-3">$5,760</div>
          <div className="text-xs text-muted-foreground mt-1">24 zaps · 8.6M sats</div>
        </div>
        <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Scheduled
          </div>
          <div className="text-2xl font-semibold mt-3">$2,331</div>
          <div className="text-xs text-muted-foreground mt-1">3 recurring contributors</div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-bg-elev-1/50">
        <div className="px-5 py-4 border-b border-border font-medium">Payment history</div>
        <div className="divide-y divide-border">
          {payments.map((p, i) => (
            <div key={i} className="px-5 py-4 flex items-center gap-4 hover:bg-bg-elev-2/40 transition">
              <div className={"h-9 w-9 rounded-full flex items-center justify-center " + (p.method === "lightning" ? "bg-[var(--yellow)]/15 text-[var(--yellow)]" : "bg-primary/15 text-primary")}>
                {p.method === "lightning" ? <Zap className="h-4 w-4" /> : <Bitcoin className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{p.to} <span className="text-muted-foreground font-normal">· {p.desc}</span></div>
                <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{p.method} · {p.time}</div>
              </div>
              <div className="text-right hidden sm:block">
                <div className="text-sm font-mono font-medium">{p.amount}</div>
                <div className="text-[11px] text-muted-foreground font-mono">{p.usd}</div>
              </div>
              <span className={"text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border flex items-center gap-1 " + statusStyle[p.status]}>
                {p.status === "settled" && <CheckCircle2 className="h-3 w-3" />}
                {p.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}