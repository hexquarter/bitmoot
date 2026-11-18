import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Building2, Check, Copy, Plus, Send, Users, Vote } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { createOrg, joinOrg, npubToHex, shortNpub, useOrg } from "../../lib/org";
import { switchOrg, useMyOrgs } from "../../lib/orgs";
import { profileLabel, profileSubtitle, useProfile } from "../../lib/profile";
import { useSettings } from "../../lib/settings";
import { Badge, Button, Card, Field, Input, PageHeader } from "../../components/ui";
import { OrgWalletNote } from "../../components/OrgWalletNote";

const relationLabel = {
  council: "You're an admin",
  member: "You're a member",
  pending: "Request pending",
  known: "Known",
} as const;

/** Recovery words stay on screen until the user explicitly continues. */
function CreatedSeedCard({ seed, onDone }: { seed: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="max-w-2xl space-y-4">
      <Card className="border-primary/40 bg-primary-dim p-6">
        <div className="font-mono text-[11px] uppercase tracking-wider text-primary">
          SAVE THESE WORDS OFFLINE
        </div>
        <h2 className="mt-2 text-xl font-serif italic">Your treasury recovery words</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          These 24 words control the organization's wallet. Write them down and keep them somewhere safe.
          This is the only time they appear in plain text.
        </p>
        <div className="mt-4 select-all rounded-md border border-border bg-background p-4 font-mono text-sm leading-relaxed">
          {seed}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            onClick={() => {
              void navigator.clipboard?.writeText(seed);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy words"}
          </Button>
          <Link
            to="/app/treasury"
            onClick={onDone}
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Continue to treasury <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <button type="button" onClick={onDone} className="text-xs text-muted-foreground hover:text-foreground">
            I saved them — go to org home
          </button>
        </div>
      </Card>
    </div>
  );
}

/** First-run onboarding and the list of orgs found for this Nostr identity. */
function OrgSetup({ onCreated }: { onCreated: (seed: string) => void }) {
  const signer = useAuth().signer!;
  const profile = useProfile(signer.pubkey);
  const { orgs, loading, reload } = useMyOrgs();
  const settings = useSettings();
  const [mode, setMode] = useState<"list" | "create" | "join">("list");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [threshold, setThreshold] = useState(1);
  const [council, setCouncil] = useState("");
  const [joinNpub, setJoinNpub] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submitCreate = async () => {
    if (!name.trim()) return toast.error("Give your organization a name");
    setBusy(true);
    try {
      const npubs = council.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      for (const npub of npubs) npubToHex(npub);
      const created = await createOrg({
        name: name.trim(),
        description: description.trim(),
        threshold,
        councilNpubs: npubs,
      });
      onCreated(created.seed);
      reload();
      toast.success("Organization created — save your recovery words");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const submitJoin = async () => {
    try {
      npubToHex(joinNpub.trim());
    } catch {
      return toast.error("That organization address is not valid");
    }
    setBusy(true);
    try {
      await joinOrg(note.trim(), joinNpub.trim());
      toast.success("Request sent — an admin will review it");
      setMode("list");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={`Hello, ${profileLabel(signer.pubkey, profile)}`}
        description={
          profileSubtitle(profile)
            ? `${profileSubtitle(profile)} · Your Nostr identity is already your account. Pick an organization below, or start one.`
            : "Your Nostr identity is already your account. Pick an organization below, or start one."
        }
        action={<Link to="/app/profile" className="text-sm text-primary hover:underline">Edit my profile →</Link>}
      />

      {mode === "list" && (
        <>
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="font-medium">Your organizations</div>
              <span className="font-mono text-[11px] text-muted-foreground">
                {loading ? "SEARCHING RELAYS…" : `${orgs.length} FOUND`}
              </span>
            </div>
            {orgs.length === 0 && !loading && (
              <div className="px-5 py-8 text-sm text-muted-foreground">
                No organizations found for this key yet. Join one with an invite address, or create your own.
              </div>
            )}
            <div className="divide-y divide-border">
              {orgs.map((item) => {
                const active = settings.activeOrgNpub === item.npub;
                return (
                  <div key={item.pubkey} className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-dim text-primary">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{item.name}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-muted-foreground-2">
                        {shortNpub(item.npub)} · {item.config ? `${item.config.threshold}-of-${item.config.vaultSigners.length} vault` : "waiting for config"}
                      </div>
                    </div>
                    <Badge tone={item.relation === "council" ? "brand" : item.relation === "pending" ? "warn" : "neutral"}>
                      {relationLabel[item.relation]}
                    </Badge>
                    {active ? (
                      <Link to="/app/treasury"><Button variant="primary" size="sm">Open</Button></Link>
                    ) : (
                      <Button onClick={() => switchOrg(item.npub)}>
                        Switch
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-6">
              <Plus className="h-6 w-6 text-primary" />
              <div className="mt-3 font-medium">Create an organization</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Set the name, invite your co-signers and publish the group to Nostr.
              </p>
              <Button className="mt-4" onClick={() => setMode("create")}>Start a group</Button>
            </Card>
            <Card className="p-6">
              <Users className="h-6 w-6 text-primary" />
              <div className="mt-3 font-medium">Join an organization</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Paste the organization's npub from an invitation and send a short request.
              </p>
              <Button className="mt-4" onClick={() => setMode("join")}>Join a group</Button>
            </Card>
          </div>
        </>
      )}

      {mode === "create" && (
        <Card className="max-w-2xl space-y-4 p-6">
          <PageHeader title="Create an organization" description="You can invite other Nostr keys next." />
          <Field label="Organization name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Plebs Label" />
          </Field>
          <Field label="What does it do?">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A music co-op paying collaborators from a shared budget."
            />
          </Field>
          <Field label="Invite members" hint="Nostr addresses (npub1…), separated by spaces or commas. Optional.">
            <Input
              value={council}
              onChange={(e) => setCouncil(e.target.value)}
              placeholder="npub1…, npub1…"
              className="font-mono"
            />
          </Field>
          <Field label="Approvals needed" hint="How many admins must agree before money moves.">
            <Input
              type="number"
              min={1}
              max={9}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value) || 1)}
              className="w-24 font-mono"
            />
          </Field>
          <div className="flex flex-wrap gap-3 border-t border-border pt-4">
            <Button variant="primary" onClick={submitCreate} disabled={busy}>
              {busy ? "Publishing…" : "Create organization"}
            </Button>
            <Button onClick={() => setMode("list")}>Cancel</Button>
          </div>
        </Card>
      )}

      {mode === "join" && (
        <Card className="max-w-2xl space-y-4 p-6">
          <PageHeader title="Join an organization" description="Ask an admin to add you to the group." />
          <Field label="Organization address" hint="The npub1… address shared in your invitation.">
            <Input
              value={joinNpub}
              onChange={(e) => setJoinNpub(e.target.value)}
              placeholder="npub1…"
              className="font-mono"
            />
          </Field>
          <Field label="Message for the admins">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Hi, I'm Lina — I work on the studio budget."
              className="w-full resize-none rounded-md border border-border bg-bg-elev-2/50 px-3 py-2 text-sm focus:outline-none focus:border-primary/60"
            />
          </Field>
          <div className="flex flex-wrap gap-3 border-t border-border pt-4">
            <Button variant="primary" onClick={submitJoin} disabled={busy || !joinNpub.trim()}>
              <Send className="h-4 w-4" /> {busy ? "Sending…" : "Send request"}
            </Button>
            <Button onClick={() => setMode("list")}>Cancel</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

export function AppIndexPage() {
  const org = useOrg();
  const signer = useAuth().signer;
  const [newSeed, setNewSeed] = useState<string | null>(null);
  if (newSeed) return <CreatedSeedCard seed={newSeed} onDone={() => setNewSeed(null)} />;

  const hasOrgAccess = org.myRole === "admin" || org.myRole === "member";
  if (!org.orgPubkey || !hasOrgAccess) return <OrgSetup onCreated={setNewSeed} />;

  const canManage = org.myRole === "admin";
  const needsMyVote = org.proposals.filter(
    (p) =>
      !p.executed &&
      !p.passed &&
      !p.votes.some((vote) => vote.author === signer?.pubkey),
  );
  const passedPayments = org.proposals.filter(
    (p) => p.type === "payment" && p.passed && !p.executed,
  );
  const activity = org.feed.slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title={org.config?.name ?? "Organization"}
        description={org.config?.description || "Everything your group needs in one place."}
        action={
          <Badge tone={org.seedUnlocked ? "good" : "warn"}>
            {org.seedUnlocked ? "WALLET OPEN" : "WALLET LOCKED"}
          </Badge>
        }
      />

      <OrgWalletNote org={org} compact />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-primary/40 bg-primary-dim/20 p-5">
          <div className="font-mono text-[11px] uppercase tracking-wider text-primary">Needs your vote</div>
          <div className="mt-2 text-3xl font-semibold text-primary">{needsMyVote.length}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {passedPayments.length
              ? `${passedPayments.length} passed payment${passedPayments.length === 1 ? "" : "s"} waiting to be paid`
              : "No passed payments waiting"}
          </p>
          <Link
            to={needsMyVote.length ? "/app/proposals" : passedPayments.length ? "/app/payments" : "/app/proposals"}
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <Vote className="h-4 w-4" />
            {needsMyVote.length ? "Vote now" : passedPayments.length ? "Review payment" : "Review proposals"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Card>
        <Card className="p-5">
          <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Group vault</div>
          <div className="mt-2 text-3xl font-semibold">
            {org.config?.threshold ?? "M"}<span className="text-muted-foreground">/{org.config?.vaultSigners.length ?? "N"}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {org.vaultComplete ? "Taproot multisig ready" : "Waiting for member signer keys"}
          </p>
          <Link to="/app/treasury" className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline">
            Open treasury <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Card>
        <Card className="p-5">
          <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Members</div>
          <div className="mt-2 text-3xl font-semibold">{org.members.length}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {canManage ? `${org.joinRequests.length} join requests to review` : "Taproot signers for the shared wallet"}
          </p>
          <Link to="/app/members" className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline">
            {canManage ? "Manage members" : "View members"} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-medium">Latest activity</div>
          <Link to="/app/feed" className="text-xs text-primary hover:underline">Open feed →</Link>
        </div>
        {activity.length === 0 ? (
          <div className="px-5 py-8 text-sm text-muted-foreground">
            No posts yet. Share an update in the feed.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {activity.map((post) => (
              <div key={post.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
                <span className="mt-0.5 font-mono text-[11px] text-muted-foreground-2">
                  {new Date(post.createdAt * 1000).toLocaleTimeString()}
                </span>
                <span className="font-mono text-[11px] text-primary">{shortNpub(post.author)}</span>
                <span className="min-w-0 flex-1 text-sm text-muted-foreground">{post.content}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
