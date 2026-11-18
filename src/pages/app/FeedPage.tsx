import { useState } from "react";
import { toast } from "sonner";
import { Radio, Send, Globe2, Lock, MessageSquare, Hash } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { publishFeedPost, shortNpub, useOrg } from "../../lib/org";
import { useSettings } from "../../lib/settings";
import { profileLabel, profileSubtitle, useProfiles } from "../../lib/profile";
import { Avatar } from "../../components/ui";
import { OrgWalletNote } from "../../components/OrgWalletNote";

const charLimit = 500;

export function FeedPage() {
  const org = useOrg();
  const canManage = org.myRole === "admin";
  const auth = useAuth().signer;
  const settings = useSettings();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const publish = async () => {
    if (!canManage || !draft.trim()) return;
    setBusy(true);
    try {
      await publishFeedPost(draft.trim());
      setDraft("");
      toast.success("Published to Nostr");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const relayCount = settings.relays.length;
  const profiles = useProfiles([
    ...(auth ? [auth.pubkey] : []),
    ...org.feed.map((post) => post.author),
  ]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif italic">
            Nostr <span className="text-primary">feed</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Org updates as signed kind:1 events, tagged to the org address. Uncensorable, portable, owned by your npub.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <span className={"h-1.5 w-1.5 rounded-full " + (org.loading ? "bg-[var(--yellow)]" : "bg-[var(--green)]")} />
          {org.loading ? "SYNCING…" : "LIVE"} · {relayCount} RELAYS
        </div>
      </div>

      <OrgWalletNote org={org} compact />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Composer — admins only */}
          {canManage && (
          <div className="rounded-lg border border-border bg-bg-elev-1/50 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-bg-elev-2/40">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">New post</span>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground-2">
                kind:1 · signed as {auth ? shortNpub(auth.npub) : "—"}
              </span>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-3">
                <Avatar
                  name={auth ? profileLabel(auth.pubkey, profiles[auth.pubkey]) : "?"}
                  src={auth ? profiles[auth.pubkey]?.picture : undefined}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium">
                      {auth ? profileLabel(auth.pubkey, profiles[auth.pubkey]) : "signed out"}
                    </span>
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

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
                <span className="text-[11px] font-mono text-muted-foreground-2 flex items-center gap-1.5">
                  <Hash className="h-3 w-3" /> tagged {`30078:${org.orgPubkey ? shortNpub(org.orgNpub ?? "") : "…"}`}
                </span>
                <div className="flex items-center gap-3">
                  <span
                    className={
                      "text-[11px] font-mono " +
                      (draft.length > charLimit * 0.9 ? "text-[var(--yellow)]" : "text-muted-foreground-2")
                    }
                  >
                    {draft.length}/{charLimit}
                  </span>
                  <button
                    onClick={publish}
                    disabled={busy || !draft.trim()}
                    className="h-9 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90 transition disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    {busy ? "Broadcasting…" : "Broadcast"}
                  </button>
                </div>
              </div>
            </div>
          </div>
          )}

          {!canManage && (
            <div className="rounded-lg border border-border bg-bg-elev-1/50 px-5 py-4 text-sm text-muted-foreground">
              Read-only feed. Only administrators publish org updates; members can propose and vote on decisions.
            </div>
          )}

          {/* Posts */}
          <div className="space-y-3">
            {org.feed.length === 0 && (
              <div className="rounded-lg border border-border bg-bg-elev-1/50 px-5 py-6 text-sm text-muted-foreground">
                {org.loading
                  ? "Loading feed from relays…"
                  : canManage
                    ? "No posts yet. Broadcast the first org update above."
                    : "No posts yet."}
              </div>
            )}
            {org.feed.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-border bg-bg-elev-1/50 hover:border-border-bright transition overflow-hidden"
              >
                <div className="flex items-start gap-3 p-5">
                  <Avatar
                    name={profileLabel(p.author, profiles[p.author])}
                    src={profiles[p.author]?.picture}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      <span className="font-medium">{profileLabel(p.author, profiles[p.author])}</span>
                      {profileSubtitle(profiles[p.author]) && (
                        <>
                          <span className="text-muted-foreground-2">·</span>
                          <span className="text-[11px] text-muted-foreground">
                            {profileSubtitle(profiles[p.author])}
                          </span>
                        </>
                      )}
                      <span className="text-muted-foreground-2">·</span>
                      <span className="text-muted-foreground">{new Date(p.createdAt * 1000).toLocaleString()}</span>
                      <span
                        className={
                          "ml-auto text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border flex items-center gap-1 " +
                          "border-[var(--green)]/30 text-[var(--green)] bg-[var(--green)]/10"
                        }
                      >
                        <Radio className="h-3 w-3" /> published
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed whitespace-pre-line break-words">{p.content}</p>
                    <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-[10px] font-mono text-muted-foreground-2 truncate">
                        {p.id.slice(0, 24)}…
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
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
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">you</span>
                <span className="truncate ml-2">{auth ? shortNpub(auth.npub) : "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">org</span>
                <span className="truncate ml-2">{org.orgNpub ? shortNpub(org.orgNpub) : "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">members</span>
                <span className="truncate ml-2">{org.members.length}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg-elev-1/50">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Relays</span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground-2">{relayCount}</span>
            </div>
            <div className="divide-y divide-border">
              {settings.relays.map((r) => (
                <div key={r} className="px-5 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-[var(--green)]" />
                    <code className="text-[11px] font-mono truncate">{r}</code>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-2.5 border-t border-border text-[10px] font-mono text-muted-foreground-2">
              manage relays in settings
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">How it works</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Every post is a standard Nostr kind:1 event signed with your own key and tagged with the org's
              addressable config <code className="text-[10px]">30078:…:bitmoot</code>. Any Nostr client can follow the
              org feed by subscribing to that tag — BitMoot is just one view of it.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Lock className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Sovereignty note</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Relays are untrusted infrastructure: they store and forward signed events but cannot forge or censor
              them (you can always re-publish elsewhere).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
