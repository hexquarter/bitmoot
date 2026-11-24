import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { npubEncode, noteEncode } from "nostr-tools/nip19";
import type { Event } from "nostr-tools";
import {
  Radio,
  Globe2,
  Lock,
  MessageSquare,
  AtSign,
  Hash,
  Link2,
  Image as ImageIcon,
  Video,
  Paperclip,
  Type,
  Eye,
  EyeOff,
  Reply,
  Quote,
  Pencil,
  Trash2,
  X,
  Vote,
  Check,
  Search,
} from "lucide-react";
import { useAuth } from "../../lib/auth";
import {
  deleteFeedPost,
  canCreateProposal,
  feedPostFromEvent,
  feedPostNevent,
  proposeFeedPost,
  shortNpub,
  useOrg,
  type FeedPost,
} from "../../lib/org";
import { isEmbeddableMedia, uploadToBlossom } from "../../lib/blossom";
import { useSettings } from "../../lib/settings";
import { profileLabel, profileSubtitle, useProfiles, type NostrProfile } from "../../lib/profile";
import { query } from "../../lib/nostr";
import { Avatar, Button } from "../../components/ui";
import { NostrContent } from "../../components/NostrContent";
import { OrgWalletNote } from "../../components/OrgWalletNote";

type ProfilesByPubkey = Record<string, NostrProfile | undefined>;

/** What the composer will submit: a post proposal, not a direct note. */
interface ComposerExtras {
  subject: string;
  subjectOpen: boolean;
  replyTo: FeedPost | null;
  quoteOf: FeedPost | null;
  /** When set, executing the proposal retracts this note and publishes the new one. */
  editing: FeedPost | null;
}

type ToolKind = "mention" | "hashtag" | "link" | null;

// ---------------------------------------------------------------------------
// Quoted events (NIP-01 `q` tags): fetched from relays on demand, cached.
// ---------------------------------------------------------------------------

const quoteCache = new Map<string, Event | null>();
const quoteAttempted = new Set<string>();

function useQuotedEvents(ids: string[]): Record<string, Event | null | undefined> {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const key = ids.join(",");
  useEffect(() => {
    let cancelled = false;
    for (const id of key ? key.split(",") : []) {
      if (quoteAttempted.has(id)) continue;
      quoteAttempted.add(id);
      void query({ ids: [id] }, 5000)
        .then((events) => {
          if (!cancelled) {
            quoteCache.set(id, events[0] ?? null);
            bump();
          }
        })
        .catch(() => {
          if (!cancelled) {
            quoteCache.set(id, null);
            bump();
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [key, bump]);
  const out: Record<string, Event | null | undefined> = {};
  for (const id of ids) out[id] = quoteCache.get(id);
  return out;
}

/** A quoted event fetched from relays can still serve as the quote target. */
function feedPostFromCachedEvent(event: Event | null | undefined): FeedPost | undefined {
  if (!event) return undefined;
  return feedPostFromEvent(event);
}

// ---------------------------------------------------------------------------
// Composer autocomplete (typing @ or # still works alongside the toolbox)
// ---------------------------------------------------------------------------

interface Suggestion {
  kind: "mention" | "hashtag";
  query: string;
  /** Index of the `@`/`#` character starting the token. */
  tokenStart: number;
}

function detectSuggestion(value: string, caret: number): Suggestion | null {
  const before = value.slice(0, caret);
  const m = before.match(/(?<=^|\s)([@#])([\p{L}\p{N}_-]*)$/u);
  if (!m) return null;
  return {
    kind: m[1] === "@" ? "mention" : "hashtag",
    query: m[2],
    tokenStart: caret - m[0].length,
  };
}

interface Candidate {
  insert: string;
  label: string;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Editor toolbox: popovers for mentions, hashtags, links and media
// ---------------------------------------------------------------------------

function ToolPopover({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      {/* click-away shield */}
      <div className="fixed inset-0 z-10" onMouseDown={onClose} />
      <div className="absolute left-0 top-full z-20 mt-1.5 w-72 rounded-md border border-border bg-bg-panel shadow-lg overflow-hidden">
        <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground-2 border-b border-border">
          {title}
        </div>
        <div className="p-2.5">{children}</div>
      </div>
    </>
  );
}

const toolInputCls =
  "w-full h-9 rounded-md border border-border bg-bg-elev-2/60 px-2.5 text-sm placeholder:text-muted-foreground-2 focus:outline-none focus:border-border-bright";

/** Link popover: paste an external URL into the note (uploaded media goes via the image/video buttons). */
function LinkToolPopover({
  draft,
  onInsert,
  onClose,
}: {
  draft: string;
  onInsert: (snippet: string) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const valid = /^https?:\/\/\S+$/i.test(url.trim());
  return (
    <ToolPopover title="Insert link" onClose={onClose}>
      <div className="space-y-2">
        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid) {
              onInsert(url.trim());
              onClose();
            }
          }}
          placeholder="https://…"
          className={toolInputCls + " font-mono text-xs"}
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Optional label"
          className={toolInputCls}
        />
        <p className="text-[10px] text-muted-foreground-2">
          Pasted links stay clickable for any Nostr client. Images/videos ending in .png/.jpg/.mp4/… embed inline.
        </p>
        <Button
          size="sm"
          variant="primary"
          className="w-full"
          disabled={!valid}
          onClick={() => {
            // Use the text selected in the editor as the link label when there is one.
            const selected = window.getSelection()?.toString() ?? "";
            const text = selected && draft.includes(selected) ? selected : "";
            onInsert(text ? `${text} ${url.trim()}` : url.trim());
            onClose();
          }}
        >
          Insert
        </Button>
      </div>
    </ToolPopover>
  );
}

/** Mention picker: search org members, insert a NIP-27 `nostr:` reference. */
function MentionToolPopover({
  members,
  profiles,
  onInsert,
  onClose,
}: {
  members: { pubkey: string; isCouncil: boolean }[];
  profiles: ProfilesByPubkey;
  onInsert: (snippet: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const matches = members
    .map((m) => ({
      ...m,
      npub: npubEncode(m.pubkey),
      label: profileLabel(m.pubkey, profiles[m.pubkey]),
    }))
    .filter((m) => !query || m.label.toLowerCase().includes(query) || m.npub.toLowerCase().includes(query))
    .sort((a, b) => Number(b.isCouncil) - Number(a.isCouncil) || a.label.localeCompare(b.label))
    .slice(0, 8);
  return (
    <ToolPopover title="Mention a member (NIP-27)" onClose={onClose}>
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground-2" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search members…"
            className={toolInputCls + " pl-7"}
          />
        </div>
        <div className="max-h-52 overflow-y-auto rounded-md border border-border divide-y divide-border">
          {matches.length === 0 && (
            <div className="px-2.5 py-2 text-xs text-muted-foreground">No members match.</div>
          )}
          {matches.map((m) => (
            <button
              key={m.pubkey}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-bg-elev-2 transition"
              onClick={() => {
                onInsert(`nostr:${m.npub}`);
                onClose();
              }}
            >
              <Avatar name={m.label} src={profiles[m.pubkey]?.picture} size={22} />
              <span className="min-w-0 flex-1 truncate text-sm">{m.label}</span>
              {m.isCouncil && (
                <span className="text-[9px] font-mono uppercase tracking-wider text-primary shrink-0">council</span>
              )}
              <span className="font-mono text-[10px] text-muted-foreground-2 shrink-0">{shortNpub(m.npub)}</span>
            </button>
          ))}
        </div>
      </div>
    </ToolPopover>
  );
}

/** Hashtag picker: pick from hashtags already used in the feed, or type one. */
function HashtagToolPopover({
  pool,
  onInsert,
  onClose,
}: {
  pool: string[];
  onInsert: (snippet: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().replace(/^#/, "").toLowerCase();
  const matches = pool.filter((t) => t.toLowerCase().includes(query)).slice(0, 8);
  const custom = query && !pool.some((t) => t.toLowerCase() === query);
  return (
    <ToolPopover title="Hashtag (NIP-24)" onClose={onClose}>
      <div className="space-y-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query) {
              onInsert(`#${query.replace(/[^\p{L}\p{N}_-]/gu, "")}`);
              onClose();
            }
          }}
          placeholder="type or pick a hashtag…"
          className={toolInputCls}
        />
        {custom && (
          <button
            className="w-full flex items-center gap-2 rounded-md border border-primary/40 bg-primary-dim px-2 py-1.5 text-left text-sm text-primary"
            onClick={() => {
              onInsert(`#${query.replace(/[^\p{L}\p{N}_-]/gu, "")}`);
              onClose();
            }}
          >
            <Hash className="h-3.5 w-3.5" /> #{query}
          </button>
        )}
        <div className="flex flex-wrap gap-1.5">
          {matches.map((t) => (
            <button
              key={t}
              className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-border-bright transition"
              onClick={() => {
                onInsert(`#${t}`);
                onClose();
              }}
            >
              #{t}
            </button>
          ))}
        </div>
      </div>
    </ToolPopover>
  );
}

function ToolboxButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={
        "h-7 px-2 rounded text-[11px] flex items-center gap-1 transition " +
        (active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-bg-elev-2")
      }
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Feed post card
// ---------------------------------------------------------------------------

function QuotedCard({
  event,
  profiles,
}: {
  event: Event | null | undefined;
  profiles: ProfilesByPubkey;
}) {
  if (event === undefined) {
    return (
      <div className="mt-2 rounded-md border border-border bg-bg-elev-2/30 px-3 py-2 text-xs text-muted-foreground-2">
        loading quoted note…
      </div>
    );
  }
  if (event === null) {
    return (
      <div className="mt-2 rounded-md border border-border bg-bg-elev-2/30 px-3 py-2 text-xs text-muted-foreground-2">
        quoted note unavailable
      </div>
    );
  }
  return (
    <div className="mt-2 rounded-md border border-border bg-bg-elev-2/40 px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs">
        <Avatar name={profileLabel(event.pubkey, profiles[event.pubkey])} src={profiles[event.pubkey]?.picture} size={20} />
        <span className="font-medium">{profileLabel(event.pubkey, profiles[event.pubkey])}</span>
        <span className="text-muted-foreground-2">·</span>
        <span className="text-[11px] text-muted-foreground">{new Date(event.created_at * 1000).toLocaleString()}</span>
        <a
          href={`https://njump.me/nostr:${noteEncode(event.id)}`}
          target="_blank"
          rel="noreferrer noopener"
          className="ml-auto text-[10px] font-mono text-muted-foreground-2 hover:text-primary"
        >
          open ↗
        </a>
      </div>
      <div className="mt-1.5 text-[13px] leading-relaxed whitespace-pre-line break-words line-clamp-6">
        <NostrContent content={event.content} profiles={profiles} />
      </div>
    </div>
  );
}

function PostCard({
  post,
  feedById,
  quotedEvents,
  profiles,
  own,
  interactive,
  onReply,
  onQuote,
  onEdit,
  onDelete,
}: {
  post: FeedPost;
  feedById: Map<string, FeedPost>;
  quotedEvents: Record<string, Event | null | undefined>;
  profiles: ProfilesByPubkey;
  own: boolean;
  interactive: boolean;
  onReply: () => void;
  onQuote: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const parent = post.replyToId ? feedById.get(post.replyToId) : undefined;

  return (
    <div className="rounded-lg border border-border bg-bg-elev-1/50 hover:border-border-bright transition overflow-hidden">
      <div className="flex items-start gap-3 p-5">
        <Avatar name={profileLabel(post.author, profiles[post.author])} src={profiles[post.author]?.picture} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="font-medium">{profileLabel(post.author, profiles[post.author])}</span>
            {profileSubtitle(profiles[post.author]) && (
              <>
                <span className="text-muted-foreground-2">·</span>
                <span className="text-[11px] text-muted-foreground">{profileSubtitle(profiles[post.author])}</span>
              </>
            )}
            <span className="text-muted-foreground-2">·</span>
            <span className="text-muted-foreground">{new Date(post.createdAt * 1000).toLocaleString()}</span>
            <span
              className={
                "ml-auto text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border flex items-center gap-1 " +
                "border-[var(--green)]/30 text-[var(--green)] bg-[var(--green)]/10"
              }
            >
              <Radio className="h-3 w-3" /> published
            </span>
          </div>

          {post.replyToId && (
            <div className="mt-1.5 text-[11px] text-muted-foreground flex items-center gap-1">
              <Reply className="h-3 w-3" />
              {parent ? (
                <span>
                  replying to{" "}
                  <a
                    href={`https://njump.me/nostr:${feedPostNevent(parent)}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary hover:underline"
                  >
                    {profileLabel(parent.author, profiles[parent.author])}
                  </a>
                </span>
              ) : (
                <span>
                  replying to an earlier post ·{" "}
                  <a
                    href={`https://njump.me/nostr:${noteEncode(post.replyToId)}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary hover:underline"
                  >
                    view
                  </a>
                </span>
              )}
            </div>
          )}

          {post.subject && <div className="mt-2 text-sm font-medium">{post.subject}</div>}

          <div className="mt-2 text-sm leading-relaxed whitespace-pre-line break-words">
            <NostrContent content={post.content} profiles={profiles} />
          </div>

          {post.quotes.map((id) => (
            <QuotedCard key={id} event={quotedEvents[id]} profiles={profiles} />
          ))}

          <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[10px] font-mono text-muted-foreground-2 truncate">{post.id.slice(0, 24)}…</span>
            <div className="flex items-center gap-1">
              {interactive && (
                <>
                  <button
                    onClick={onReply}
                    title="Propose a reply (published once approved)"
                    className="h-7 px-2 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-bg-elev-2 flex items-center gap-1"
                  >
                    <Reply className="h-3.5 w-3.5" /> reply
                  </button>
                  <button
                    onClick={onQuote}
                    title="Propose a quote (NIP-01)"
                    className="h-7 px-2 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-bg-elev-2 flex items-center gap-1"
                  >
                    <Quote className="h-3.5 w-3.5" /> quote
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(`nostr:${feedPostNevent(post)}`);
                  toast.success("Copied nostr: reference");
                }}
                title="Copy portable nostr: link"
                className="h-7 px-2 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-bg-elev-2 flex items-center gap-1"
              >
                <Link2 className="h-3.5 w-3.5" /> copy
              </button>
              {own && interactive && (
                <button
                  onClick={onEdit}
                  title="Propose an edit: publishes a new note and retracts this one (NIP-09)"
                  className="h-7 px-2 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-bg-elev-2 flex items-center gap-1"
                >
                  <Pencil className="h-3.5 w-3.5" /> edit
                </button>
              )}
              {own && (
                confirmDelete ? (
                  <span className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setConfirmDelete(false);
                        onDelete();
                      }}
                      className="h-7 px-2 rounded text-[11px] text-destructive border border-destructive/40 hover:bg-destructive/10"
                    >
                      confirm delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="h-7 px-2 rounded text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    title="Retract with NIP-09"
                    className="h-7 px-2 rounded text-[11px] text-muted-foreground hover:text-destructive hover:bg-bg-elev-2 flex items-center gap-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> delete
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const EMPTY_EXTRAS: ComposerExtras = {
  subject: "",
  subjectOpen: false,
  replyTo: null,
  quoteOf: null,
  editing: null,
};

export function FeedPage() {
  const org = useOrg();
  const canManage = org.myRole === "admin";
  const auth = useAuth().signer;
  const settings = useSettings();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [extras, setExtras] = useState<ComposerExtras>(EMPTY_EXTRAS);
  const [tool, setTool] = useState<ToolKind>(null);
  const [preview, setPreview] = useState(false);
  const [uploads, setUploads] = useState<{ id: number; name: string; pct: number; kind: "image" | "video" }[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [activeCandidate, setActiveCandidate] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);

  const canProposePosts = canCreateProposal();
  const feedById = useMemo(() => new Map(org.feed.map((p) => [p.id, p])), [org.feed]);
  const quoteIds = useMemo(() => [...new Set(org.feed.flatMap((p) => p.quotes))], [org.feed]);
  const quotedEvents = useQuotedEvents(quoteIds);

  const openPostProposals = org.proposals.filter((p) => p.type === "feedPost" && !p.executed);

  const profileKeys = useMemo(() => {
    const set = new Set<string>();
    if (auth) set.add(auth.pubkey);
    for (const m of org.members) set.add(m.pubkey);
    for (const p of org.feed) {
      set.add(p.author);
      for (const pk of p.mentions) set.add(pk);
      const qe = p.quotes.map((id) => quotedEvents[id]).find((ev) => ev);
      if (qe) set.add(qe.pubkey);
    }
    return [...set];
  }, [org.members, org.feed, quotedEvents, auth]);
  const profiles = useProfiles(profileKeys);

  const focusComposer = () => {
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    textareaRef.current?.focus();
  };

  const startReply = (post: FeedPost) => {
    setExtras((x) => ({ ...x, replyTo: post, editing: null }));
    focusComposer();
  };
  const startQuote = (post: FeedPost) => {
    setExtras((x) => ({ ...x, quoteOf: post, editing: null }));
    focusComposer();
  };
  const startEdit = (post: FeedPost) => {
    const parent = post.replyToId ? feedById.get(post.replyToId) : undefined;
    const quoted = post.quotes
      .map((id) => feedById.get(id) ?? feedPostFromCachedEvent(quoteCache.get(id)))
      .find(Boolean);
    setDraft(post.content);
    setExtras({
      subject: post.subject ?? "",
      subjectOpen: Boolean(post.subject),
      replyTo: parent ?? null,
      quoteOf: quoted ?? null,
      editing: post,
    });
    focusComposer();
  };

  const resetComposer = () => {
    setDraft("");
    setExtras(EMPTY_EXTRAS);
    setSuggestion(null);
    setTool(null);
    setPreview(false);
  };

  // Let the editor grow with the content (no length cap, so long posts need room).
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight + 2, 420)}px`;
  }, [draft]);

  /** Submit the draft as a feed-post proposal (published once the vote passes). */
  const submitProposal = async () => {
    if (!canProposePosts || !draft.trim()) return;
    setBusy(true);
    try {
      await proposeFeedPost({
        content: draft,
        subject: extras.subjectOpen ? extras.subject.trim() || undefined : undefined,
        replyToId: extras.replyTo?.id,
        quoteOfId: extras.quoteOf?.id,
        replaceId: extras.editing?.id,
      });
      resetComposer();
      toast.success("Post proposal submitted — it publishes to the feed when the vote passes");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const removePost = async (post: FeedPost) => {
    try {
      await deleteFeedPost(post.id);
      toast.success("Post retracted (NIP-09)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  /** Insert text at the caret, replacing the current selection. */
  const insertAtCaret = (text: string, opts?: { padBefore?: boolean }) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? draft.length;
    const end = ta.selectionEnd ?? start;
    const pad = opts?.padBefore && start > 0 && !/\s$/.test(draft.slice(0, start)) ? " " : "";
    const next = `${draft.slice(0, start)}${pad}${text}${draft.slice(end)}`;
    setDraft(next);
    const pos = Math.min(start + pad.length + text.length, next.length);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  // Media upload (Blossom) ---------------------------------------------------
  const uploadFiles = async (files: File[]) => {
    const media = files.filter(isEmbeddableMedia);
    const skipped = files.length - media.length;
    if (skipped) toast.error(`${skipped} file${skipped === 1 ? "" : "s"} skipped — only images and videos embed`);
    if (!media.length) return;
    for (const file of media) {
      const id = Date.now() + Math.random();
      const kind: "image" | "video" = file.type.startsWith("video/") || /\.(mp4|webm|mov|mkv)$/i.test(file.name) ? "video" : "image";
      setUploads((u) => [...u, { id, name: file.name, pct: 0, kind }]);
      try {
        const desc = await uploadToBlossom(file, {
          onProgress: (pct) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, pct } : x))),
        });
        insertAtCaret(desc.url, { padBefore: true });
        toast.success(`${file.name} uploaded to Blossom`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setUploads((u) => u.filter((x) => x.id !== id));
      }
    }
  };

  /** Open the local file picker for a media kind (upload goes to Blossom). */
  const openFilePicker = (kind: "image" | "video") => {
    const input = fileInputRef.current;
    if (!input) return;
    input.accept = kind === "image" ? "image/*" : "video/*";
    input.click();
  };

  const onMediaDrop = (e: ReactDragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const files = [...e.dataTransfer.files];
    if (files.length) void uploadFiles(files);
  };

  const onMediaPaste = (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...e.clipboardData.files];
    if (files.length) {
      e.preventDefault();
      void uploadFiles(files);
    }
  };

  // Autocomplete candidates -------------------------------------------------
  const mentionCandidates = useMemo(() => {
    if (suggestion?.kind !== "mention") return [];
    const q = suggestion.query.toLowerCase();
    return org.members
      .map((m) => ({
        pubkey: m.pubkey,
        npub: npubEncode(m.pubkey),
        label: profileLabel(m.pubkey, profiles[m.pubkey]),
        isCouncil: m.isCouncil,
      }))
      .filter(
        (m) =>
          m.label.toLowerCase().includes(q) ||
          m.pubkey.startsWith(q) ||
          (q.length >= 4 && m.npub.toLowerCase().includes(q)),
      )
      .sort((a, b) => Number(b.isCouncil) - Number(a.isCouncil) || a.label.localeCompare(b.label))
      .slice(0, 6)
      .map((m) => ({ insert: `nostr:${m.npub}`, label: m.label, detail: shortNpub(m.npub) }));
  }, [suggestion, org.members, profiles]);

  const hashtagPool = useMemo(() => {
    const set = new Set<string>();
    for (const p of org.feed) for (const t of p.hashtags) set.add(t);
    return [...set].sort();
  }, [org.feed]);

  const hashtagCandidates = useMemo<Candidate[]>(() => {
    if (suggestion?.kind !== "hashtag") return [];
    const q = suggestion.query.toLowerCase();
    return hashtagPool
      .filter((t) => t.toLowerCase().startsWith(q))
      .slice(0, 6)
      .map((t) => ({ insert: `#${t}`, label: `#${t}` }));
  }, [suggestion, hashtagPool]);

  const candidates = mentionCandidates.length ? mentionCandidates : hashtagCandidates;

  const applyCandidate = (candidate: Candidate) => {
    const ta = textareaRef.current;
    if (!ta || !suggestion) return;
    const caret = ta.selectionStart ?? draft.length;
    const next = `${draft.slice(0, suggestion.tokenStart)}${candidate.insert} ${draft.slice(caret)}`;
    setDraft(next);
    setSuggestion(null);
    const pos = Math.min(suggestion.tokenStart + candidate.insert.length + 1, next.length);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  const onDraftChange = (value: string) => {
    setDraft(value);
    const ta = textareaRef.current;
    setSuggestion(detectSuggestion(value, ta?.selectionStart ?? value.length));
    setActiveCandidate(0);
  };

  const onDraftKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submitProposal();
      return;
    }
    if (!suggestion || !candidates.length) return;
    const active = Math.min(activeCandidate, candidates.length - 1);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveCandidate((active + 1) % candidates.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveCandidate((active - 1 + candidates.length) % candidates.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      applyCandidate(candidates[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setSuggestion(null);
    }
  };

  const relayCount = settings.relays.length;
  const composerTitle = extras.editing
    ? "Propose post edit"
    : extras.replyTo
      ? "Propose a reply"
      : "New post proposal";

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif italic">
            Nostr <span className="text-primary">feed</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compose a post, submit it for a member vote, and it publishes to Nostr when approved —
            mentions (NIP-27), hashtags (NIP-24), threads (NIP-10), quotes (NIP-01), deletions (NIP-09).
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
          {/* Pending post proposals shortcut */}
          {canProposePosts && openPostProposals.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary-dim/30 px-4 py-3">
              <div className="flex items-center gap-2 text-sm">
                <Vote className="h-4 w-4 text-primary" />
                <span>
                  <strong className="text-primary">{openPostProposals.length}</strong> post
                  proposal{openPostProposals.length === 1 ? "" : "s"} awaiting a vote
                </span>
              </div>
              <Link to="/app/proposals" className="text-xs text-primary hover:underline">
                Review proposals ↗
              </Link>
            </div>
          )}

          {/* Composer — proposals per org permissions */}
          {canProposePosts && (
          <div ref={composerRef} className="rounded-lg border border-border bg-bg-elev-1/50">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-bg-elev-2/40 rounded-t-lg">
              <div className="flex items-center gap-2">
                <Vote className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{composerTitle}</span>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground-2">
                kind:37000 · encrypted for members
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

                  {(extras.replyTo || extras.quoteOf || extras.editing) && (
                    <div className="mt-2 space-y-1">
                      {extras.editing && (
                        <div className="flex items-center gap-2 rounded-md border border-[var(--yellow)]/30 bg-[var(--yellow)]/10 px-2.5 py-1.5 text-[11px] text-[var(--yellow)]">
                          <Pencil className="h-3 w-3 shrink-0" />
                          Edit proposal: publishes a new note and retracts the original (NIP-09)
                          <button
                            onClick={() => setExtras(EMPTY_EXTRAS)}
                            className="ml-auto hover:opacity-70"
                            title="Cancel edit"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                      {extras.replyTo && (
                        <div className="flex items-center gap-2 rounded-md border border-border bg-bg-elev-2/40 px-2.5 py-1.5 text-[11px]">
                          <Reply className="h-3 w-3 shrink-0 text-primary" />
                          Replying to{" "}
                          <span className="font-medium">
                            {profileLabel(extras.replyTo.author, profiles[extras.replyTo.author])}
                          </span>
                          <button
                            onClick={() => setExtras((x) => ({ ...x, replyTo: null }))}
                            className="ml-auto text-muted-foreground-2 hover:text-foreground"
                            title="Cancel reply"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                      {extras.quoteOf && (
                        <div className="flex items-center gap-2 rounded-md border border-border bg-bg-elev-2/40 px-2.5 py-1.5 text-[11px]">
                          <Quote className="h-3 w-3 shrink-0 text-primary" />
                          Quoting{" "}
                          <span className="truncate max-w-[24rem]">
                            {extras.quoteOf.content.slice(0, 80) || "a post"}
                          </span>
                          <button
                            onClick={() => setExtras((x) => ({ ...x, quoteOf: null }))}
                            className="ml-auto text-muted-foreground-2 hover:text-foreground"
                            title="Cancel quote"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => onDraftChange(e.target.value)}
                    onKeyDown={onDraftKeyDown}
                    onDrop={onMediaDrop}
                    onPaste={onMediaPaste}
                    rows={4}
                    placeholder="Compose the post… mentions, hashtags, links and media embed for every Nostr client."
                    className="mt-2 w-full bg-transparent text-sm placeholder:text-muted-foreground-2 focus:outline-none resize-none leading-relaxed"
                  />

                  {/* Editor toolbox */}
                  <div className="relative mt-2 flex items-center gap-1 flex-wrap border-t border-border pt-2">
                    <ToolboxButton
                      icon={<AtSign className="h-3.5 w-3.5" />}
                      label="mention"
                      active={tool === "mention"}
                      onClick={() => setTool(tool === "mention" ? null : "mention")}
                    />
                    <ToolboxButton
                      icon={<Hash className="h-3.5 w-3.5" />}
                      label="hashtag"
                      active={tool === "hashtag"}
                      onClick={() => setTool(tool === "hashtag" ? null : "hashtag")}
                    />
                    <ToolboxButton
                      icon={<Link2 className="h-3.5 w-3.5" />}
                      label="link"
                      active={tool === "link"}
                      onClick={() => setTool(tool === "link" ? null : "link")}
                    />
                    <ToolboxButton
                      icon={<ImageIcon className="h-3.5 w-3.5" />}
                      label="image"
                      active={uploads.some((u) => u.kind === "image")}
                      onClick={() => openFilePicker("image")}
                    />
                    <ToolboxButton
                      icon={<Video className="h-3.5 w-3.5" />}
                      label="video"
                      active={uploads.some((u) => u.kind === "video")}
                      onClick={() => openFilePicker("video")}
                    />
                    <ToolboxButton
                      icon={<Type className="h-3.5 w-3.5" />}
                      label="subject"
                      active={extras.subjectOpen}
                      onClick={() => setExtras((x) => ({ ...x, subjectOpen: !x.subjectOpen }))}
                    />
                    <ToolboxButton
                      icon={preview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      label="preview"
                      active={preview}
                      onClick={() => setPreview((p) => !p)}
                    />
                    <span className="ml-auto text-[10px] font-mono text-muted-foreground-2">⌘↵ submit</span>

                    {tool === "mention" && (
                      <MentionToolPopover
                        members={org.members}
                        profiles={profiles}
                        onInsert={insertAtCaret}
                        onClose={() => setTool(null)}
                      />
                    )}
                    {tool === "hashtag" && (
                      <HashtagToolPopover pool={hashtagPool} onInsert={(t) => insertAtCaret(t, { padBefore: true })} onClose={() => setTool(null)} />
                    )}
                    {tool === "link" && (
                      <LinkToolPopover
                        draft={draft}
                        onInsert={(t) => insertAtCaret(t, { padBefore: true })}
                        onClose={() => setTool(null)}
                      />
                    )}
                  </div>

                  {/* Hidden file picker for Blossom uploads (sr-only keeps it
                      clickable and in the a11y tree; display:none breaks
                      programmatic .click() in some browsers) */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    aria-label="Attach images or videos (uploaded to Blossom)"
                    className="sr-only"
                    onChange={(e) => {
                      const files = [...(e.target.files ?? [])];
                      e.target.value = "";
                      void uploadFiles(files);
                    }}
                  />

                  {/* Upload progress */}
                  {uploads.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {uploads.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center gap-2 rounded-md border border-border bg-bg-elev-2/40 px-2.5 py-1.5 text-[11px]"
                        >
                          <Paperclip className="h-3 w-3 shrink-0 text-primary" />
                          <span className="truncate flex-1">{u.name}</span>
                          <div className="h-1 w-20 rounded-full bg-bg-elev-2 overflow-hidden shrink-0">
                            <div className="h-full bg-primary transition-all" style={{ width: `${u.pct}%` }} />
                          </div>
                          <span className="font-mono text-muted-foreground-2 shrink-0">{u.pct}%</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {extras.subjectOpen && (
                    <input
                      value={extras.subject}
                      onChange={(e) => setExtras((x) => ({ ...x, subject: e.target.value.slice(0, 120) }))}
                      placeholder="Subject / title (NIP-14)"
                      className="mt-2 w-full rounded-md border border-border bg-bg-elev-2/40 px-3 h-9 text-sm placeholder:text-muted-foreground-2 focus:outline-none focus:border-border-bright"
                    />
                  )}

                  {/* Autocomplete (typing @ or #) */}
                  {suggestion && candidates.length > 0 && (
                    <div className="mt-2 rounded-md border border-border bg-bg-elev-2/60 overflow-hidden">
                      <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground-2 border-b border-border">
                        {candidates[0].insert.startsWith("nostr:") ? "mention (NIP-27)" : "hashtag (NIP-24)"} · ↑↓ · ⏎
                      </div>
                      {candidates.map((c, i) => (
                        <button
                          key={c.insert}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            applyCandidate(c);
                          }}
                          className={
                            "w-full text-left px-3 py-1.5 flex items-center gap-2 text-sm " +
                            (i === Math.min(activeCandidate, candidates.length - 1)
                              ? "bg-primary/10"
                              : "hover:bg-bg-elev-2")
                          }
                        >
                          <span className="font-medium truncate">{c.label}</span>
                          {c.detail && (
                            <span className="text-[11px] font-mono text-muted-foreground-2 truncate">{c.detail}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Live preview with the same renderer the feed uses */}
                  {preview && draft.trim() && (
                    <div className="mt-2 rounded-md border border-border bg-bg-elev-2/30 px-3 py-2.5">
                      <div className="mb-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground-2">
                        preview
                      </div>
                      <div className="text-sm leading-relaxed whitespace-pre-line break-words">
                        <NostrContent content={draft} profiles={profiles} eager />
                      </div>
                    </div>
                  )}
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
                      (draft.length > 4000 ? "text-[var(--yellow)]" : "text-muted-foreground-2")
                    }
                    title={draft.length > 4000 ? "Very long notes may exceed some relays' max event size" : undefined}
                  >
                    {draft.length} chars
                  </span>
                  <button
                    onClick={() => void submitProposal()}
                    disabled={busy || !draft.trim()}
                    className="h-9 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90 transition disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    {busy ? "Submitting…" : "Submit for approval"}
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground-2">
                The post publishes to Nostr once {org.config?.threshold ?? "M"} member vote
                {org.config?.threshold === 1 ? "" : "s"} approve it. Track it on the proposals page.
              </p>
            </div>
          </div>
          )}

          {!canManage && !canProposePosts && !org.loading && (
            <div className="rounded-lg border border-border bg-bg-elev-1/50 px-5 py-4 text-sm text-muted-foreground">
              Read-only feed. Join the organization to propose posts and vote on decisions.
            </div>
          )}

          {/* Posts */}
          <div className="space-y-3">
            {org.feed.length === 0 && (
              <div className="rounded-lg border border-border bg-bg-elev-1/50 px-5 py-6 text-sm text-muted-foreground">
                {org.loading
                  ? "Loading feed from relays…"
                  : canProposePosts
                    ? "No posts yet. Compose the first post proposal above."
                    : "No posts yet."}
              </div>
            )}
            {org.feed.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                feedById={feedById}
                quotedEvents={quotedEvents}
                profiles={profiles}
                own={auth?.pubkey === p.author}
                interactive={canProposePosts}
                onReply={() => startReply(p)}
                onQuote={() => startQuote(p)}
                onEdit={() => startEdit(p)}
                onDelete={() => void removePost(p)}
              />
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
              Compose a post, then submit it as an encrypted proposal (kind 37000). When{" "}
              {org.config?.threshold ?? "M"} members approve, an administrator publishes it as a standard
              kind:1 note tagged to the org address <code className="text-[10px]">30078:…:bitmoot</code>. Posts
              carry the full NIP tag set: <code className="text-[10px]">p</code> mentions (NIP-27),{" "}
              <code className="text-[10px]">t</code> hashtags (NIP-24), <code className="text-[10px]">e</code>{" "}
              thread markers (NIP-10), <code className="text-[10px]">q</code> quotes (NIP-01),{" "}
              <code className="text-[10px]">subject</code> (NIP-14) and{" "}
              <code className="text-[10px]">client</code> (NIP-89). Retractions use NIP-09. Any Nostr client
              can follow the org feed — BitMoot is just one view of it.
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
