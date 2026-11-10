import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Copy, Check, Radio, Users, ArrowRight } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { createOrg, joinOrg, useOrg, shortNpub, npubToHex } from "../../lib/org";
import { setSettings } from "../../lib/settings";

/** First-run: create or join an org when none is active. */
function OrgSetup() {
  const [mode, setMode] = useState<"choice" | "create" | "join">("choice");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [threshold, setThreshold] = useState(1);
  const [council, setCouncil] = useState("");
  const [joinNpub, setJoinNpub] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdSeed, setCreatedSeed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const signer = useAuth().signer!;

  const submitCreate = async () => {
    if (!name.trim()) return toast.error("Give your org a name");
    setBusy(true);
    try {
      const npubs = council
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const npub of npubs) {
        try {
          npubToHex(npub);
        } catch {
          throw new Error(`Invalid npub: ${npub}`);
        }
      }
      const created = await createOrg({ name: name.trim(), description: description.trim(), threshold, councilNpubs: npubs });
      setCreatedSeed(created.seed);
      toast.success("Org created — back up the seed!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const submitJoin = async () => {
    setBusy(true);
    try {
      await joinOrg(note);
      toast.success("Join request published — a council member must approve you");
      setMode("choice");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (createdSeed) {
    return (
      <div className="rounded-lg border border-primary/40 bg-primary-dim p-6 max-w-2xl">
        <div className="text-[11px] font-mono uppercase tracking-wider text-primary">ORG WALLET SEED — BACK THIS UP</div>
        <h2 className="text-xl font-serif italic mt-2">The 24 words below control the org treasury</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Write them down and store them offline. Every council member receives an encrypted copy on Nostr, but
          this is the only moment the raw seed is shown to you. Losing it with no other backup means losing the treasury.
        </p>
        <div className="mt-4 rounded-md border border-border bg-background p-4 font-mono text-sm leading-relaxed break-all select-all">
          {createdSeed}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2"
            onClick={() => {
              navigator.clipboard?.writeText(createdSeed);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy seed"}
          </button>
          <Link to="/app" className="text-sm text-primary hover:underline flex items-center gap-1" onClick={() => window.location.reload()}>
            Continue to workspace <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-serif italic">Set up your workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {shortNpub(signer.npub)}. An org is a Nostr identity (npub) with a shared treasury.
        </p>
      </div>

      {mode === "choice" && (
        <div className="grid sm:grid-cols-2 gap-4">
          <button onClick={() => setMode("create")} className="rounded-lg border border-primary/40 bg-primary-dim p-6 text-left hover:border-primary transition">
            <Plus className="h-6 w-6 text-primary mb-3" />
            <div className="font-medium">Create an organization</div>
            <p className="text-xs text-muted-foreground mt-1">
              Generates an org wallet seed, publishes the org config to your relays, and invites council members.
            </p>
          </button>
          <div className="rounded-lg border border-border bg-bg-elev-1/50 p-6 space-y-3">
            <div className="flex items-center gap-2 font-medium"><Radio className="h-4 w-4 text-primary" /> Join an existing org</div>
            <input
              value={joinNpub}
              onChange={(e) => setJoinNpub(e.target.value)}
              placeholder="Org npub1…"
              className="w-full h-10 rounded-md border border-border bg-bg-elev-2/50 px-3 text-sm font-mono focus:outline-none focus:border-primary/60"
            />
            <button
              disabled={busy || !joinNpub.trim()}
              onClick={() => {
                try {
                  npubToHex(joinNpub.trim());
                  setSettings({ activeOrgNpub: joinNpub.trim() });
                  setMode("join");
                } catch {
                  toast.error("Invalid org npub");
                }
              }}
              className="w-full h-10 rounded-md border border-border text-sm hover:border-primary/50 hover:text-primary transition disabled:opacity-50"
            >
              Point workspace at org
            </button>
          </div>
        </div>
      )}

      {mode === "create" && (
        <div className="rounded-lg border border-border bg-bg-elev-1/50 p-6 space-y-4">
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Organization name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Plebs Label"
              className="mt-1.5 w-full h-10 rounded-md border border-border bg-bg-elev-2/50 px-3 text-sm focus:outline-none focus:border-primary/60" />
          </div>
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A music co-op coordinating budgets on Bitcoin."
              className="mt-1.5 w-full h-10 rounded-md border border-border bg-bg-elev-2/50 px-3 text-sm focus:outline-none focus:border-primary/60" />
          </div>
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Council npubs (comma or space separated — they receive an encrypted seed share)
            </label>
            <input value={council} onChange={(e) => setCouncil(e.target.value)} placeholder="npub1…, npub1…"
              className="mt-1.5 w-full h-10 rounded-md border border-border bg-bg-elev-2/50 px-3 text-sm font-mono focus:outline-none focus:border-primary/60" />
          </div>
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Vault threshold M-of-N (votes and vault signatures required)
            </label>
            <input type="number" min={1} max={9} value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value) || 1)}
              className="mt-1.5 w-24 h-10 rounded-md border border-border bg-bg-elev-2/50 px-3 text-sm font-mono focus:outline-none focus:border-primary/60" />
            <p className="text-[11px] text-muted-foreground-2 mt-1">Start with 1-of-1 while testing; add council members after.</p>
          </div>
          <button disabled={busy} onClick={submitCreate}
            className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition disabled:opacity-50">
            {busy ? "Publishing org…" : "Create org on Nostr"}
          </button>
        </div>
      )}

      {mode === "join" && (
        <div className="rounded-lg border border-border bg-bg-elev-1/50 p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm"><Users className="h-4 w-4 text-primary" /> Request to join {shortNpub(joinNpub)}</div>
          <p className="text-xs text-muted-foreground">
            This publishes your vault signer key and a join request (kind 9703). A council member then approves you,
            which sends your key an encrypted copy of the org wallet seed.
          </p>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="A short note for the council…"
            className="w-full rounded-md border border-border bg-bg-elev-2/50 px-3 py-2 text-sm focus:outline-none focus:border-primary/60 resize-none" />
          <button disabled={busy} onClick={submitJoin}
            className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition disabled:opacity-50">
            {busy ? "Publishing…" : "Send join request"}
          </button>
        </div>
      )}
    </div>
  );
}

export function AppIndexPage() {
  const org = useOrg();

  if (!org.orgPubkey) return <OrgSetup />;

  const openProposals = org.proposals.filter((p) => !p.executed);
  const passed = org.proposals.filter((p) => p.passed && !p.executed);
  const threshold = org.config?.threshold ?? 0;
  const activity = org.feed.slice(0, 6);

  return (
    <div className="dashboard">
      <div className="page-heading"><div><div className="portal-kicker">{org.config?.name?.toUpperCase() ?? "ORG"} / DASHBOARD</div><h1>Control room</h1><p>{org.config?.description || "One view of the money, the votes, and the machine carrying both."}</p></div><div className="system-state"><i /> {org.seedUnlocked ? "TREASURY UNLOCKED" : "TREASURY LOCKED"}<br /><small>{org.vaultComplete ? `${threshold}-OF-${org.vault?.signers.length} VAULT READY` : "VAULT INCOMPLETE"}</small></div></div>

      <section className="dashboard-hero" aria-label="Treasury overview">
        <div className="balance-readout"><div className="portal-kicker">TREASURY / SELF-CUSTODY</div><strong>{org.seedUnlocked ? "SPARK LIVE" : "LOCKED"}</strong><span>SPARK WALLET · LIGHTNING + USDB + L1</span><div className="balance-meta"><span><Link to="/app/treasury">{org.seedUnlocked ? "VIEW BALANCES →" : "UNLOCK TREASURY →"}</Link></span></div></div>
        <div className="signer-readout"><div className="portal-kicker">VAULT QUORUM</div><strong>{org.vault?.threshold ?? threshold} <em>/</em> {org.vault?.signers.length ?? org.config?.vaultSigners.length ?? 0}</strong><div className="signer-track">{Array.from({ length: org.config?.vaultSigners.length ?? 0 }).map((_, i) => <b key={i} />)}</div><span>TAPROOT M-of-N MULTISIG</span><Link to="/app/treasury">OPEN VAULT →</Link></div>
        <div className="block-readout"><div className="portal-kicker">ORG STATE</div><strong>{openProposals.length}</strong><span>OPEN PROPOSALS</span><div className="network-line"><i /> {org.members.length} MEMBERS <b>{passed.length} PASSED</b></div></div>
      </section>

      <section className="dashboard-grid">
        <div className="console-section proposal-console"><div className="console-heading"><div><div className="portal-kicker">GOVERNANCE / OPEN ITEMS</div><h2>Proposal queue</h2></div><Link to="/app/proposals">VIEW ALL →</Link></div><div className="proposal-table">{openProposals.length ? <div className="table-head"><span>ID</span><span>PROPOSAL</span><span>VOTES</span><span>STATE</span></div> : <div style={{ padding: "24px 20px", color: "var(--ink-mid)", fontSize: 14 }}>No proposals yet — create the first one.</div>}{openProposals.slice(0, 5).map((p) => <Link to="/app/proposals" className="proposal-item" key={p.id}><span className="proposal-id">{p.id.slice(0, 8)}</span><span><strong>{p.title}</strong><small>{p.yesCount} yes · {p.noCount} no</small></span><span className="quorum"><i style={{ width: `${Math.min(100, (p.yesCount / Math.max(1, threshold)) * 100)}%` }} /><small>{p.yesCount}/{threshold}</small></span><b className={p.passed ? "state-stable" : "state-pending"}>{p.passed ? "PASSED" : "VOTING"}</b></Link>)}</div></div>
        <aside className="console-section artifact-console"><div className="portal-kicker">VERIFIABLE ARTIFACT</div><h2>Vault address</h2><p>Anyone with the address can verify treasury holdings on any explorer.</p><code>{org.vault?.address ?? (org.vaultComplete ? "…" : "vault not complete")}</code><div className="artifact-details"><span>THRESHOLD</span><b>{threshold}-of-{org.config?.vaultSigners.length ?? 0}</b><span>TYPE</span><b>TAPROOT CHECKSIGADD</b><span>VAULT SIGNERS</span><b>{org.config?.vaultSigners.length ?? 0} PUBLISHED</b></div><Link to="/app/members">MANAGE SIGNERS →</Link></aside>
      </section>

      <section className="console-section activity-console"><div className="console-heading"><div><div className="portal-kicker">EVENT STREAM / KIND:1</div><h2>Recent activity</h2></div><span className="relay-state"><i /> NOSTR FEED LIVE</span></div><div className="activity-table">{activity.length ? activity.map((p) => <div className="activity-item" key={p.id}><time>{new Date(p.createdAt * 1000).toLocaleTimeString()}</time><b className="event-nostr">NOSTR</b><strong>{shortNpub(p.author)}</strong><span>{p.content.slice(0, 90)}{p.content.length > 90 ? "…" : ""}</span></div>) : <div style={{ padding: "24px 20px", color: "var(--ink-mid)", fontSize: 14 }}>No feed activity yet.</div>}</div></section>
    </div>
  );
}
