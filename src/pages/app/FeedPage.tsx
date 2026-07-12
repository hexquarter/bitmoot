import { useState } from "react";
import {
  Radio,
  Send,
  Image as ImageIcon,
  Hash,
  Globe2,
  Lock,
  Zap,
  CheckCircle2,
  Clock,
  Repeat2,
  Heart,
  MessageCircle,
  Plus,
  Trash2,
  Calendar,
  Sparkles,
} from "lucide-react";

const relays = [
  { url: "wss://relay.damus.io", status: "online", latency: 42 },
  { url: "wss://nos.lol", status: "online", latency: 88 },
  { url: "wss://relay.snort.social", status: "online", latency: 134 },
  { url: "wss://relay.primal.net", status: "degraded", latency: 421 },
];

const posts = [
  {
    id: "evt_a8f2",
    kind: 1,
    status: "published",
    author: "Plebs Label",
    time: "2h ago",
    content:
      "🎙️ PROP-013 just passed — 4,200 USD released to @lina for the new mixing studio. Settled on-chain in block 901,201. Sovereign coordination, in the open.",
    tags: ["#bitcoin", "#dao", "#nostr"],
    relaysOk: 4,
    relaysTotal: 4,
    likes: 128,
    reposts: 34,
    replies: 12,
    zaps: "21,400",
    pinned: true,
  },
  {
    id: "evt_b3d1",
    kind: 1,
    status: "published",
    author: "Plebs Label",
    time: "1d ago",
    content:
      "New member onboarded: welcome npub1k4z…wq2x to the co-op. We're now 12 sovereigns coordinating budgets, royalties and grants — 100% on Bitcoin.",
    tags: ["#welcome", "#dao"],
    relaysOk: 4,
    relaysTotal: 4,
    likes: 64,
    reposts: 8,
    replies: 5,
    zaps: "4,200",
  },
  {
    id: "evt_c91a",
    kind: 1,
    status: "scheduled",
    author: "Plebs Label",
    time: "in 3h · Tue 14:00 UTC",
    content:
      "📜 Q3 transparency report drops tomorrow. Treasury, payouts, all proposals — signed and verifiable on Nostr.",
    tags: ["#transparency"],
    relaysOk: 0,
    relaysTotal: 4,
    likes: 0,
    reposts: 0,
    replies: 0,
    zaps: "0",
  },
  {
    id: "evt_d77e",
    kind: 1,
    status: "draft",
    author: "Plebs Label",
    time: "Edited 12m ago",
    content:
      "Working on a proposal template for grant disbursements — would love community feedback before publishing.",
    tags: ["#governance", "#draft"],
    relaysOk: 0,
    relaysTotal: 4,
    likes: 0,
    reposts: 0,
    replies: 0,
    zaps: "0",
  },
  {
    id: "evt_e22b",
    kind: 1,
    status: "failed",
    author: "Plebs Label",
    time: "3d ago",
    content:
      "Test post — checking relay propagation after policy change.",
    tags: [],
    relaysOk: 1,
    relaysTotal: 4,
    likes: 0,
    reposts: 0,
    replies: 0,
    zaps: "0",
  },
];

const statusStyle: Record<string, string> = {
  published: "border-[var(--green)]/30 text-[var(--green)] bg-[var(--green)]/10",
  scheduled: "border-[var(--blue)]/30 text-[var(--blue)] bg-[var(--blue)]/10",
  draft: "border-border-bright text-muted-foreground bg-bg-elev-2/60",
  failed: "border-destructive/30 text-destructive bg-destructive/10",
};

const statusIcon: Record<string, any> = {
  published: CheckCircle2,
  scheduled: Calendar,
  draft: Clock,
  failed: Radio,
};

export function FeedPage() {
  const [draft, setDraft] = useState(
    "📣 PROP-014 is live — Q3 grant for Nostr client localization. Read the full spec on our feed and weigh in. Quorum: 67%.",
  );
  const [requireApproval, setRequireApproval] = useState(true);
  const [activeFilter, setActiveFilter] = useState("All");
  const charLimit = 500;

  const filtered =
    activeFilter === "All"
      ? posts
      : posts.filter((p) => p.status === activeFilter.toLowerCase());

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif italic">
            Nostr <span className="text-primary">feed</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Publish DAO updates as signed Nostr events. Uncensorable, portable, owned by your npub.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--green)] pulse-dot" />
          {relays.filter((r) => r.status === "online").length}/{relays.length} RELAYS ONLINE
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Composer */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-lg border border-border bg-bg-elev-1/50 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-bg-elev-2/40">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">New post</span>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground-2">
                kind:1 · signed by DAO npub
              </span>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-3">
                <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-primary to-[oklch(0.82_0.17_70)] flex items-center justify-center text-[11px] font-bold text-primary-foreground">
                  PL
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium">Plebs Label</span>
                    <span className="font-mono text-muted-foreground-2 truncate">npub1q2…7xa3</span>
                  </div>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value.slice(0, charLimit))}
                    rows={4}
                    placeholder="Share an update with your community…"
                    className="mt-2 w-full bg-transparent text-sm placeholder:text-muted-foreground-2 focus:outline-none resize-none leading-relaxed"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap pl-12">
                {["#bitcoin", "#dao", "#nostr", "+ tag"].map((t, i) => (
                  <span
                    key={t}
                    className={
                      "text-[11px] font-mono px-2 py-0.5 rounded border " +
                      (i === 3
                        ? "border-dashed border-border text-muted-foreground hover:text-foreground hover:border-border-bright cursor-pointer"
                        : "border-primary/30 text-primary bg-primary-dim")
                    }
                  >
                    {t}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
                <div className="flex items-center gap-1">
                  {[ImageIcon, Hash, Zap, Calendar].map((Icon, i) => (
                    <button
                      key={i}
                      className="h-8 w-8 rounded-md hover:bg-bg-elev-2 text-muted-foreground hover:text-primary transition flex items-center justify-center"
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={
                      "text-[11px] font-mono " +
                      (draft.length > charLimit * 0.9 ? "text-[var(--yellow)]" : "text-muted-foreground-2")
                    }
                  >
                    {draft.length}/{charLimit}
                  </span>
                  <button className="h-9 px-3 rounded-md border border-border text-sm hover:border-border-bright transition">
                    Save draft
                  </button>
                  <button className="h-9 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90 transition">
                    <Send className="h-4 w-4" />
                    {requireApproval ? "Submit for approval" : "Broadcast"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {["All", "Published", "Scheduled", "Draft", "Failed"].map((t) => {
              const active = activeFilter === t;
              return (
                <button
                  key={t}
                  onClick={() => setActiveFilter(t)}
                  className={
                    "h-8 px-3 rounded-md text-xs font-mono uppercase tracking-wider border transition " +
                    (active
                      ? "bg-bg-elev-2 border-border-bright text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-border-bright")
                  }
                >
                  {t}
                </button>
              );
            })}
          </div>

          {/* Posts */}
          <div className="space-y-3">
            {filtered.map((p) => {
              const Icon = statusIcon[p.status];
              return (
                <div
                  key={p.id}
                  className="rounded-lg border border-border bg-bg-elev-1/50 hover:border-border-bright transition overflow-hidden"
                >
                  <div className="flex items-start gap-3 p-5">
                    <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-primary to-[oklch(0.82_0.17_70)] flex items-center justify-center text-[11px] font-bold text-primary-foreground">
                      PL
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <span className="font-medium">{p.author}</span>
                        <span className="text-muted-foreground-2">·</span>
                        <span className="text-muted-foreground">{p.time}</span>
                        {p.pinned && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/30">
                            PINNED
                          </span>
                        )}
                        <span
                          className={
                            "ml-auto text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border flex items-center gap-1 " +
                            statusStyle[p.status]
                          }
                        >
                          <Icon className="h-3 w-3" /> {p.status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">{p.content}</p>
                      {p.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {p.tags.map((t) => (
                            <span key={t} className="text-[11px] font-mono text-primary">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono">
                          <span className="flex items-center gap-1.5">
                            <Radio className="h-3.5 w-3.5" />
                            {p.relaysOk}/{p.relaysTotal}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Heart className="h-3.5 w-3.5" />
                            {p.likes}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Repeat2 className="h-3.5 w-3.5" />
                            {p.reposts}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <MessageCircle className="h-3.5 w-3.5" />
                            {p.replies}
                          </span>
                          <span className="flex items-center gap-1.5 text-[var(--yellow)]">
                            <Zap className="h-3.5 w-3.5" />
                            {p.zaps}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-muted-foreground-2">{p.id}</span>
                          {p.status === "failed" && (
                            <button className="text-xs text-primary hover:underline">Retry →</button>
                          )}
                          {p.status === "draft" && (
                            <button className="text-xs text-primary hover:underline">Publish →</button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Globe2 className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Identity</span>
            </div>
            <div className="rounded-md border border-border bg-bg-elev-2/40 p-3 font-mono text-[11px] space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">npub</span>
                <span className="truncate ml-2">npub1q2…7xa3</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">NIP-05</span>
                <span>plebs@sovereign.dao</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Followers</span>
                <span>1,284</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg-elev-1/50">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Relays</span>
              </div>
              <button className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
            <div className="divide-y divide-border">
              {relays.map((r) => (
                <div key={r.url} className="px-5 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={
                        "h-1.5 w-1.5 rounded-full shrink-0 " +
                        (r.status === "online" ? "bg-[var(--green)]" : "bg-[var(--yellow)]")
                      }
                    />
                    <code className="text-[11px] font-mono truncate">{r.url}</code>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-muted-foreground-2">{r.latency}ms</span>
                    <button className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Lock className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Publishing policy</span>
            </div>
            <label className="flex items-start gap-3 py-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={requireApproval}
                onChange={(e) => setRequireApproval(e.target.checked)}
                className="h-4 w-4 mt-0.5 accent-[var(--primary)]"
              />
              <div className="text-xs">
                <div className="text-foreground">Require 2-of-5 signer approval</div>
                <div className="text-muted-foreground mt-0.5">
                  Posts go to a pending queue and are broadcast once threshold is met.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 py-1.5 cursor-pointer">
              <input type="checkbox" defaultChecked className="h-4 w-4 mt-0.5 accent-[var(--primary)]" />
              <div className="text-xs">
                <div className="text-foreground">Auto-post on proposal pass</div>
                <div className="text-muted-foreground mt-0.5">
                  Broadcast a transparency note when a proposal settles on-chain.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 py-1.5 cursor-pointer">
              <input type="checkbox" className="h-4 w-4 mt-0.5 accent-[var(--primary)]" />
              <div className="text-xs">
                <div className="text-foreground">Mirror to long-form (NIP-23)</div>
                <div className="text-muted-foreground mt-0.5">
                  Cross-post weekly digests as articles for Habla, Highlighter, etc.
                </div>
              </div>
            </label>
          </div>

          <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5">
            <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-3">
              30-day reach
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-lg font-semibold">42</div>
                <div className="text-[10px] text-muted-foreground-2 font-mono mt-0.5">POSTS</div>
              </div>
              <div>
                <div className="text-lg font-semibold">18.4k</div>
                <div className="text-[10px] text-muted-foreground-2 font-mono mt-0.5">IMPRESSIONS</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-[var(--yellow)]">128k</div>
                <div className="text-[10px] text-muted-foreground-2 font-mono mt-0.5">SATS ZAPPED</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}