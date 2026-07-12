import {
  Bitcoin,
  Wallet,
  Vote,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Send,
  CheckCircle2,
  Clock,
  Radio,
} from "lucide-react";
import { Link } from "react-router-dom";

function Stat({
  label,
  value,
  sub,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  sub: string;
  icon: any;
  trend?: "up" | "down";
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5 hover:border-border-bright transition">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-muted-foreground-2" />
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        {trend === "up" && <ArrowUpRight className="h-3 w-3 text-[var(--green)]" />}
        {trend === "down" && <ArrowDownRight className="h-3 w-3 text-destructive" />}
        <span>{sub}</span>
      </div>
    </div>
  );
}

export function AppIndexPage() {
  return (
    <div className="space-y-8 max-w-7xl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif italic">
            Welcome back, <span className="text-primary">Satoshi</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Here's what's happening in your DAO today.</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--green)] pulse-dot" />
          ALL SYSTEMS NOMINAL
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Treasury" value="₿ 2.847" sub="≈ $189,420 · +3.2% 7d" icon={Bitcoin} trend="up" />
        <Stat label="Open proposals" value="4" sub="2 voting · 1 queued" icon={Vote} />
        <Stat label="Members" value="12" sub="+1 this week" icon={Users} trend="up" />
        <Stat label="Payouts (30d)" value="$24,180" sub="32 transactions" icon={Send} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Active proposals */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-bg-elev-1/50">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <div className="font-medium">Active proposals</div>
              <div className="text-xs text-muted-foreground">Signed via Nostr · settled on Bitcoin</div>
            </div>
            <Link to="/app/proposals" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          <div className="divide-y divide-border">
            {[
              { id: "PROP-014", title: "Q3 grant: Nostr client localization", status: "voting", quorum: 67, time: "2d left" },
              { id: "PROP-013", title: "Approve $4,200 to Lina (mixing studio)", status: "voting", quorum: 92, time: "12h left" },
              { id: "PROP-012", title: "Add Marc as 5th signer", status: "queued", quorum: 100, time: "Broadcast pending" },
              { id: "PROP-011", title: "Migrate treasury to taproot vault", status: "passed", quorum: 100, time: "Settled · block 901,201" },
            ].map((p) => (
              <div key={p.id} className="px-5 py-4 flex items-center gap-4 hover:bg-bg-elev-2/40 transition">
                <div className="font-mono text-[11px] text-muted-foreground-2 w-16 shrink-0">{p.id}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                    <span className="font-mono">{p.quorum}% quorum</span>
                    <span>·</span>
                    <span>{p.time}</span>
                  </div>
                </div>
                <span
                  className={
                    "text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border " +
                    (p.status === "voting"
                      ? "border-primary/30 text-primary bg-primary-dim"
                      : p.status === "queued"
                      ? "border-[var(--yellow)]/30 text-[var(--yellow)] bg-[var(--yellow)]/10"
                      : "border-[var(--green)]/30 text-[var(--green)] bg-[var(--green)]/10")
                  }
                >
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Treasury card */}
        <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5 flex flex-col">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Treasury</div>
            <Wallet className="h-4 w-4 text-muted-foreground-2" />
          </div>
          <div className="mt-4">
            <div className="text-3xl font-mono font-semibold tracking-tight">₿ 2.847</div>
            <div className="text-sm text-muted-foreground mt-1">≈ $189,420.51 USD</div>
          </div>
          <div className="mt-4 rounded-md border border-border bg-bg-elev-2/40 p-3 font-mono text-[11px] space-y-1.5">
            <div className="flex justify-between"><span className="text-muted-foreground">Multisig</span><span>3-of-5 taproot</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Address</span><span className="truncate ml-2">bc1p…f9d2</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">UTXOs</span><span>14</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Fee rate</span><span>4 sat/vB</span></div>
          </div>
          <Link
            to="/app/treasury"
            className="mt-4 h-9 rounded-md bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center hover:opacity-90 transition"
          >
            Open treasury
          </Link>
        </div>
      </div>

      {/* Activity feed */}
      <div className="rounded-lg border border-border bg-bg-elev-1/50">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <div className="font-medium">Recent activity</div>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1.5">
            <Radio className="h-3 w-3" /> live from relays
          </span>
        </div>
        <div className="divide-y divide-border font-mono text-[12px]">
          {[
            { i: CheckCircle2, c: "text-[var(--green)]", t: "Proposal PROP-011 settled on-chain", s: "block 901,201 · 2h ago" },
            { i: Vote, c: "text-primary", t: "Marc signed PROP-013 (yes)", s: "kind:30052 · 4h ago" },
            { i: Send, c: "text-[var(--blue)]", t: "Lightning payout 120,000 sats → @lina", s: "preimage 4f7a… · 6h ago" },
            { i: Clock, c: "text-[var(--yellow)]", t: "PROP-014 quorum reached (67%)", s: "12h ago" },
            { i: Users, c: "text-foreground", t: "New member joined: npub1k4z…wq2x", s: "1d ago" },
          ].map((a, i) => {
            const Icon = a.i;
            return (
              <div key={i} className="px-5 py-3 flex items-center gap-3">
                <Icon className={"h-4 w-4 " + a.c} />
                <span className="flex-1">{a.t}</span>
                <span className="text-muted-foreground-2 text-[11px]">{a.s}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}