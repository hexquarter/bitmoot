import { Plus, Key, Crown, MoreHorizontal } from "lucide-react";

const members = [
  { name: "Satoshi K.", handle: "@satoshi", npub: "npub1q2…7xa3", role: "Founder", signer: true, votes: 142, joined: "Genesis" },
  { name: "Lina M.", handle: "@lina", npub: "npub1k4z…wq2x", role: "Producer", signer: true, votes: 98, joined: "Mar 2025" },
  { name: "Marc D.", handle: "@marc", npub: "npub1f7s…3dp1", role: "Engineer", signer: true, votes: 86, joined: "Apr 2025" },
  { name: "Kai R.", handle: "@kai", npub: "npub1m9c…h4u8", role: "Treasurer", signer: true, votes: 71, joined: "May 2025" },
  { name: "Yuki T.", handle: "@yuki", npub: "npub1a3v…c2nm", role: "Curator", signer: true, votes: 64, joined: "Jun 2025" },
  { name: "Pablo G.", handle: "@pablo", npub: "npub1b8x…r9pz", role: "Member", signer: false, votes: 32, joined: "Aug 2025" },
  { name: "Nina O.", handle: "@nina", npub: "npub1d2k…v6mq", role: "Member", signer: false, votes: 28, joined: "Sep 2025" },
  { name: "Theo W.", handle: "@theo", npub: "npub1g7p…l1aj", role: "Member", signer: false, votes: 17, joined: "Oct 2025" },
];

export function MembersPage() {
  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif italic">Members</h1>
          <p className="mt-1 text-sm text-muted-foreground">Identified by Nostr keys. Signers can co-sign treasury moves.</p>
        </div>
        <button className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90 transition">
          <Plus className="h-4 w-4" /> Invite member
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l: "Total", v: "12" },
          { l: "Signers", v: "5" },
          { l: "Voting power", v: "538" },
          { l: "Joined 30d", v: "+3" },
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
          <div className="col-span-3">Nostr key</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-2">Voting power</div>
          <div className="col-span-1 text-right">·</div>
        </div>
        <div className="divide-y divide-border">
          {members.map((m) => (
            <div key={m.handle} className="px-5 py-3.5 grid grid-cols-1 md:grid-cols-12 gap-3 items-center hover:bg-bg-elev-2/40 transition">
              <div className="md:col-span-4 flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-primary to-[oklch(0.82_0.17_70)] flex items-center justify-center text-xs font-bold text-primary-foreground">
                  {m.name.split(" ").map((n) => n[0]).join("")}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-1.5">
                    {m.name}
                    {m.role === "Founder" && <Crown className="h-3 w-3 text-[var(--yellow)]" />}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono">{m.handle}</div>
                </div>
              </div>
              <div className="md:col-span-3 font-mono text-[11px] text-muted-foreground truncate">{m.npub}</div>
              <div className="md:col-span-2">
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border border-border bg-bg-elev-2/50">
                  {m.role}
                </span>
                {m.signer && (
                  <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border border-primary/30 text-primary bg-primary-dim">
                    <Key className="h-2.5 w-2.5" /> signer
                  </span>
                )}
              </div>
              <div className="md:col-span-2 font-mono text-sm">{m.votes}</div>
              <div className="md:col-span-1 flex md:justify-end">
                <button className="text-muted-foreground hover:text-foreground"><MoreHorizontal className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}