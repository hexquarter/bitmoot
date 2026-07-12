import { Bitcoin, ArrowUpRight, ArrowDownRight, Copy, ExternalLink, Shield, Zap } from "lucide-react";

const txs = [
  { dir: "in", desc: "Membership dues", amount: "+0.0250 BTC", usd: "+$1,663", from: "@kai", time: "2h ago", conf: 6 },
  { dir: "out", desc: "PROP-013 payout · Lina", amount: "−0.0631 BTC", usd: "−$4,200", from: "bc1q…ax3p", time: "6h ago", conf: 24 },
  { dir: "in", desc: "Sponsor inflow", amount: "+0.5000 BTC", usd: "+$33,260", from: "bc1p…m1n5", time: "1d ago", conf: 144 },
  { dir: "out", desc: "Lightning payout · @marc", amount: "−120,000 sat", usd: "−$80", from: "LN", time: "1d ago", conf: 0 },
  { dir: "out", desc: "PROP-011 vault migration", amount: "−2.0000 BTC", usd: "−$133,040", from: "bc1p…f9d2", time: "3d ago", conf: 432 },
];

export function TreasuryPage() {
  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-serif italic">Treasury</h1>
        <p className="mt-1 text-sm text-muted-foreground">Self-custodial. No bridges. 3-of-5 taproot multisig.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg border border-border bg-gradient-to-br from-bg-elev-1 to-bg-elev-2/30 p-6 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Total balance</div>
              <Bitcoin className="h-5 w-5 text-primary" />
            </div>
            <div className="mt-4 text-5xl font-mono font-semibold tracking-tight">₿ 2.847</div>
            <div className="text-lg text-muted-foreground mt-1">≈ $189,420.51 USD</div>
            <div className="mt-6 flex flex-wrap gap-2">
              <button className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90 transition">
                <ArrowUpRight className="h-4 w-4" /> Send
              </button>
              <button className="h-10 px-4 rounded-md border border-border bg-bg-elev-2/50 text-sm flex items-center gap-2 hover:border-border-bright transition">
                <ArrowDownRight className="h-4 w-4" /> Receive
              </button>
              <button className="h-10 px-4 rounded-md border border-border bg-bg-elev-2/50 text-sm flex items-center gap-2 hover:border-border-bright transition">
                <Zap className="h-4 w-4 text-[var(--yellow)]" /> Lightning
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5 space-y-4">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            <Shield className="h-3.5 w-3.5 text-primary" /> Vault details
          </div>
          <div className="font-mono text-[12px] space-y-2">
            <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>Taproot multisig</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Threshold</span><span>3-of-5</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">UTXOs</span><span>14</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Fee rate</span><span>4 sat/vB</span></div>
          </div>
          <div className="rounded-md border border-border bg-bg-elev-2/50 p-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5">Address</div>
            <div className="flex items-center gap-2">
              <code className="font-mono text-[11px] truncate flex-1">bc1pq8x4n3v…0fk9d2</code>
              <button className="text-muted-foreground hover:text-primary transition"><Copy className="h-3.5 w-3.5" /></button>
              <button className="text-muted-foreground hover:text-primary transition"><ExternalLink className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-bg-elev-1/50">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="font-medium">Transactions</div>
          <div className="text-[11px] font-mono text-muted-foreground">Last 30 days</div>
        </div>
        <div className="divide-y divide-border">
          {txs.map((t, i) => (
            <div key={i} className="px-5 py-3.5 flex items-center gap-4 hover:bg-bg-elev-2/40 transition">
              <div className={"h-8 w-8 rounded-full flex items-center justify-center " + (t.dir === "in" ? "bg-[var(--green)]/15 text-[var(--green)]" : "bg-primary/15 text-primary")}>
                {t.dir === "in" ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{t.desc}</div>
                <div className="text-[11px] text-muted-foreground font-mono">{t.from} · {t.time} · {t.conf} conf</div>
              </div>
              <div className="text-right">
                <div className={"text-sm font-mono font-medium " + (t.dir === "in" ? "text-[var(--green)]" : "text-foreground")}>{t.amount}</div>
                <div className="text-[11px] text-muted-foreground font-mono">{t.usd}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}