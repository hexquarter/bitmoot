import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  AtSign,
  BadgeCheck,
  Camera,
  Globe2,
  Link2,
  RefreshCw,
  Save,
  UserRound,
  Zap,
} from "lucide-react";
import { useAuth } from "../../lib/auth";
import {
  fetchProfiles,
  hasProfileLoaded,
  lightningUri,
  profileLabel,
  profileSubtitle,
  saveProfile,
  useProfile,
  websiteUrl,
} from "../../lib/profile";
import { Avatar, Button, Card, CopyButton, Field, Input, PageHeader } from "../../components/ui";

/** Edit the user's public Nostr profile (kind 0). */
export function ProfilePage() {
  const signer = useAuth().signer!;
  const remote = useProfile(signer.pubkey);
  const loaded = hasProfileLoaded(signer.pubkey);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Remount the form if the fetched profile changes so fields stay in sync
  // without an effect overwriting what the user is typing.
  const profileKey = remote ? JSON.stringify(remote) : "empty";

  const nip05 = remote?.nip05;
  const lightning = lightningUri(remote);
  const website = websiteUrl(remote?.website);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await fetchProfiles([signer.pubkey], true);
      toast.success("Profile refreshed from Nostr");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim() || undefined;
    setBusy(true);
    try {
      await saveProfile({
        name: text("name"),
        displayName: text("displayName"),
        about: text("about"),
        picture: text("picture"),
        banner: text("banner"),
        nip05: text("nip05"),
        lud06: text("lud06"),
        lud16: text("lud16"),
        website: text("website"),
      });
      toast.success("Profile published to Nostr");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Your profile"
        description="This is public on Nostr. Other members see it when you post, vote or request to join."
        action={
          <div className="flex items-center gap-3">
            <span
              className={
                "hidden font-mono text-[10px] uppercase tracking-wider sm:inline " +
                (remote ? "text-primary" : "text-muted-foreground-2")
              }
            >
              {remote
                ? "Loaded from relays"
                : loaded
                  ? "Not found on relays"
                  : "Loading from relays…"}
            </span>
            <Button onClick={refresh} disabled={refreshing}>
              <RefreshCw className={"h-4 w-4 " + (refreshing ? "animate-spin" : "")} />
              {refreshing ? "Refreshing…" : "Refresh from Nostr"}
            </Button>
          </div>
        }
      />

      <Card className="overflow-hidden">
        {remote?.banner && (
          <div
            className="h-28 w-full bg-bg-elev-2 bg-cover bg-center"
            style={{ backgroundImage: `url(${remote.banner})` }}
          />
        )}
        <div className="flex flex-wrap items-center gap-4 p-5">
          <Avatar name={profileLabel(signer.pubkey, remote)} src={remote?.picture} size={56} />
          <div className="min-w-0 flex-1">
            <div className="text-lg font-medium">{profileLabel(signer.pubkey, remote)}</div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground-2">
              {profileSubtitle(remote) || signer.npub}
            </div>
            {remote?.about && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{remote.about}</p>}
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              {nip05 && (
                <span className="inline-flex items-center gap-1.5 rounded border border-primary/30 bg-primary-dim px-2 py-1 text-primary">
                  <BadgeCheck className="h-3.5 w-3.5" /> {nip05}
                </span>
              )}
              {lightning && (
                <a
                  href={lightning}
                  className="inline-flex items-center gap-1.5 rounded border border-border bg-bg-elev-2/50 px-2 py-1 text-muted-foreground hover:text-primary"
                >
                  <Zap className="h-3.5 w-3.5 text-[var(--yellow)]" /> {lightning.replace("lightning:", "")}
                </a>
              )}
              {website && (
                <a
                  href={website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded border border-border bg-bg-elev-2/50 px-2 py-1 text-muted-foreground hover:text-primary"
                >
                  <Globe2 className="h-3.5 w-3.5" /> {remote?.website}
                </a>
              )}
              <span className="inline-flex items-center gap-1.5 rounded border border-border bg-bg-elev-2/50 px-2 py-1 font-mono text-muted-foreground-2">
                <AtSign className="h-3.5 w-3.5" /> {signer.npub.slice(0, 16)}…
              </span>
            </div>
          </div>
          <CopyButton value={signer.npub} label="Copy npub" />
        </div>
        {!remote && loaded && (
          <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            No public profile is published for this key yet. Fill in the fields below to publish one.
          </div>
        )}
      </Card>

      <Card>
        <form key={profileKey} className="space-y-5 p-5" onSubmit={save}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input name="name" defaultValue={remote?.name ?? ""} placeholder="Lina" />
            </Field>
            <Field label="Display name">
              <Input
                name="displayName"
                defaultValue={remote?.display_name ?? remote?.displayName ?? ""}
                placeholder="Lina at the studio"
              />
            </Field>
          </div>
          <Field label="Bio" hint="A short introduction for other members.">
            <textarea
              name="about"
              defaultValue={remote?.about ?? ""}
              rows={3}
              placeholder="I coordinate payments for our music co-op."
              className="w-full resize-none rounded-md border border-border bg-bg-elev-2/50 px-3 py-2 text-sm focus:outline-none focus:border-primary/60"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Profile picture URL">
              <Input
                name="picture"
                defaultValue={remote?.picture ?? ""}
                placeholder="https://example.com/avatar.jpg"
              />
            </Field>
            <Field label="Banner URL" hint="Optional header image on your profile.">
              <Input
                name="banner"
                defaultValue={remote?.banner ?? ""}
                placeholder="https://example.com/banner.jpg"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nostr address" hint="NIP-05 name@domain, verified by your domain">
              <Input
                name="nip05"
                defaultValue={remote?.nip05 ?? ""}
                placeholder="lina@example.com"
              />
            </Field>
            <Field label="Lightning address" hint="LUD-16 address, e.g. name@wallet.com">
              <Input
                name="lud16"
                defaultValue={remote?.lud16 ?? ""}
                placeholder="lina@wallet.com"
              />
            </Field>
          </div>
          <Field label="LNURL-pay" hint="Older LUD-06 bech32 or lightning address format.">
            <Input
              name="lud06"
              defaultValue={remote?.lud06 ?? ""}
              placeholder="lnurl1…"
              className="font-mono"
            />
          </Field>
          <Field label="Website">
            <Input
              name="website"
              defaultValue={remote?.website ?? ""}
              placeholder="https://example.com"
            />
          </Field>
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground-2">
              <UserRound className="h-3.5 w-3.5" /> <Camera className="h-3.5 w-3.5" />
              <AtSign className="h-3.5 w-3.5" /> <Globe2 className="h-3.5 w-3.5" />
              <Link2 className="h-3.5 w-3.5" /> signed as your Nostr key
            </div>
            <Button type="submit" variant="primary" disabled={busy}>
              <Save className="h-4 w-4" /> {busy ? "Publishing…" : "Save profile"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
