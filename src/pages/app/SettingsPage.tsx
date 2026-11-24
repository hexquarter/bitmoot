import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { Shield, Radio, Key, Globe2, Trash2, Plus, Check, Copy, Bitcoin, Zap, LogOut, UserRound, Code2, Image as ImageIcon, type LucideIcon } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { lockTreasury, npubToHex, proposeConfigChange, shortNpub, useOrg, orgWalletSeed } from "../../lib/org";
import { hasProfileLoaded, profileLabel, profileSubtitle, saveOrgProfile, useProfile } from "../../lib/profile";
import { logOut } from "../../lib/session";
import { setSettings, useSettings, DEFAULT_RELAYS, type SparkNetwork } from "../../lib/settings";
import { setBlossomServers } from "../../lib/blossom";
import { disconnectOrgWallet } from "../../lib/spark";
import { Avatar, Button, Field, Input } from "../../components/ui";

function Section({ icon: Icon, title, desc, children }: { icon: LucideIcon; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elev-1/50 overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-start gap-3">
        <div className="h-9 w-9 rounded-md bg-primary-dim flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <div className="font-medium">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
        </div>
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const org = useOrg();
  const auth = useAuth().signer;
  const profile = useProfile(auth?.pubkey);
  const settings = useSettings();

  const [orgNpub, setOrgNpub] = useState(settings.activeOrgNpub ?? "");
  const [newRelay, setNewRelay] = useState("");
  const [newBlossom, setNewBlossom] = useState("");
  const [explorer, setExplorer] = useState(settings.explorerApiBase ?? "");
  const [showMySeed, setShowMySeed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const orgProfile = useProfile(org.orgPubkey);
  const orgProfileLoaded = org.orgPubkey ? hasProfileLoaded(org.orgPubkey) : false;
  const orgProfileKey = orgProfile ? JSON.stringify(orgProfile) : "empty";

  const saveOrgProfileInfo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim() || undefined;
    setBusy("orgprofile");
    try {
      await proposeConfigChange({
        action: "setOrgProfile",
        orgProfile: {
          name: text("name"),
          displayName: text("displayName"),
          about: text("about"),
          picture: text("picture"),
          banner: text("banner"),
          nip05: text("nip05"),
          lud16: text("lud16"),
          website: text("website"),
        },
      });
      toast.success("Profile proposal published — applies automatically when it passes");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSignOut = () => {
    logOut();
    toast.success("Signed out");
    navigate("/auth", { replace: true });
  };

  const switchNetwork = (network: SparkNetwork) => {
    if (settings.network === network) return;
    disconnectOrgWallet(); // wallet will re-init on the new network
    setSettings({ network });
    toast.success(`Network switched to ${network}`);
  };

  const switchOrg = () => {
    const npub = orgNpub.trim();
    if (!npub) {
      lockTreasury();
      setSettings({ activeOrgNpub: undefined });
      toast.success("Workspace detached — set up an org on the dashboard");
      return;
    }
    try {
      npubToHex(npub);
      lockTreasury(); // seed belongs to the old org
      setSettings({ activeOrgNpub: npub });
      toast.success("Workspace pointed at new org");
    } catch {
      toast.error("Invalid org npub");
    }
  };

  const addRelay = () => {
    const url = newRelay.trim();
    if (!url) return;
    if (!/^wss?:\/\//.test(url)) return toast.error("Relay must start with wss:// or ws://");
    if (settings.relays.includes(url)) return toast.error("Relay already listed");
    setSettings({ relays: [...settings.relays, url] });
    setNewRelay("");
    toast.success("Relay added");
  };

  const removeRelay = (url: string) => {
    setSettings({ relays: settings.relays.filter((r) => r !== url) });
    toast.success("Relay removed");
  };

  const addBlossom = () => {
    const url = newBlossom.trim().replace(/\/+$/, "");
    if (!/^https?:\/\//.test(url)) return toast.error("Blossom server must start with https://");
    if ((settings.blossomServers ?? []).includes(url)) return toast.error("Server already listed");
    setBlossomServers([...(settings.blossomServers ?? []), url]);
    setNewBlossom("");
    toast.success("Media server added");
  };

  const removeBlossom = (url: string) => {
    setBlossomServers((settings.blossomServers ?? []).filter((r) => r !== url));
    toast.success("Media server removed");
  };

  const saveExplorer = () => {
    setSettings({ explorerApiBase: explorer.trim() || undefined });
    toast.success("Explorer API saved");
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-serif italic">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your Nostr identity, network, relays, org, and keys.</p>
      </div>

      <Section icon={UserRound} title="Nostr profile" desc="Your public name and picture, stored as a signed Nostr event.">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-bg-elev-2/40 p-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">{auth ? profileLabel(auth.pubkey, profile) : "Not signed in"}</div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {auth ? profileSubtitle(profile) || shortNpub(auth.npub) : "—"}
            </div>
            <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground-2">
              {auth ? auth.npub : "—"}
            </div>
          </div>
          <Link to="/app/profile" className="text-xs text-primary hover:underline">Edit profile →</Link>
        </div>
      </Section>

      <Section icon={Zap} title="Spark network" desc="Which Spark network the org wallet connects to.">
        <div className="flex gap-2">
          {(["MAINNET", "REGTEST"] as const).map((n) => (
            <button
              key={n}
              onClick={() => switchNetwork(n)}
              className={
                "h-10 px-4 rounded-md text-xs font-mono uppercase tracking-wider border transition " +
                (settings.network === n
                  ? "border-primary/60 bg-primary-dim text-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-border-bright")
              }
            >
              {n}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground-2">
          {settings.network === "REGTEST"
            ? "Regtest needs a local sparkd + regtest bitcoin node; set the explorer API below (e.g. http://localhost:3000/api)."
            : "Mainnet uses Spark's production infrastructure. Real money — be careful."}
        </p>
      </Section>

      <Section icon={Code2} title="Advanced mode" desc="Show raw Nostr events, signatures, and PSBT data when reviewing proposals.">
        <button
          onClick={() => setSettings({ advancedMode: !settings.advancedMode })}
          className={
            "h-10 w-full rounded-md border text-sm font-medium transition " +
            (settings.advancedMode
              ? "border-primary/60 bg-primary-dim text-primary"
              : "border-border text-muted-foreground hover:border-border-bright hover:text-foreground")
          }
        >
          {settings.advancedMode ? "On — cryptographic details visible" : "Off — simple view"}
        </button>
        <p className="text-[11px] text-muted-foreground-2">
          Default off so everyday voting stays simple. You can also toggle it inside each proposal review.
        </p>
      </Section>

      <Section icon={Globe2} title="Organization" desc="The org npub this workspace reads and publishes to.">
        <div>
          <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Org npub</label>
          <div className="mt-1.5 flex gap-2">
            <input
              value={orgNpub}
              onChange={(e) => setOrgNpub(e.target.value)}
              placeholder={org.orgNpub ?? "npub1…"}
              className="flex-1 h-10 rounded-md border border-border bg-bg-elev-2/50 px-3 text-sm font-mono focus:outline-none focus:border-primary/60"
            />
            <button
              onClick={switchOrg}
              className="h-10 px-4 shrink-0 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
            >
              Switch
            </button>
          </div>
          <div className="text-[11px] text-muted-foreground-2 mt-1.5">
            Current: {org.orgNpub ?? "none"}. Switching locks the treasury (the seed belongs to the previous org).
          </div>
        </div>
      </Section>

      {org.myRole === "admin" && org.orgPubkey && (
        <Section icon={Globe2} title="Organization profile" desc="Public metadata for the org's Nostr identity, signed with the org key.">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar name={org.config?.name ?? org.orgNpub ?? "org"} src={orgProfile?.picture} size={40} />
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{profileLabel(org.orgPubkey, orgProfile)}</div>
                <div className="truncate font-mono text-[10px] text-muted-foreground-2">{org.orgNpub}</div>
              </div>
            </div>
            <span className={"font-mono text-[10px] uppercase tracking-wider " + (orgProfile ? "text-primary" : "text-muted-foreground-2")}>
              {orgProfile ? "loaded from relays" : orgProfileLoaded ? "not found" : "loading…"}
            </span>
          </div>
          <form key={orgProfileKey} className="space-y-4" onSubmit={saveOrgProfileInfo}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name">
                  <Input name="name" defaultValue={orgProfile?.name ?? org.config?.name ?? ""} placeholder="Probe Council" />
                </Field>
                <Field label="Display name">
                  <Input name="displayName" defaultValue={orgProfile?.display_name ?? ""} placeholder="Probe Council HQ" />
                </Field>
              </div>
              <Field label="About" hint="Shown with the org npub in every Nostr client.">
                <textarea
                  name="about"
                  defaultValue={orgProfile?.about ?? org.config?.description ?? ""}
                  rows={3}
                  placeholder="A music co-op paying collaborators from a shared budget."
                  className="w-full resize-none rounded-md border border-border bg-bg-elev-2/50 px-3 py-2 text-sm focus:outline-none focus:border-primary/60"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Picture URL">
                  <Input name="picture" defaultValue={orgProfile?.picture ?? ""} placeholder="https://…/logo.png" />
                </Field>
                <Field label="Banner URL" hint="Header image on the org profile.">
                  <Input name="banner" defaultValue={orgProfile?.banner ?? ""} placeholder="https://…/banner.jpg" />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nostr address" hint="NIP-05 identifier for the org, e.g. org@yourdomain.">
                  <Input name="nip05" defaultValue={orgProfile?.nip05 ?? ""} placeholder="org@example.com" />
                </Field>
                <Field label="Lightning address" hint="LUD-16 address for org zaps.">
                  <Input name="lud16" defaultValue={orgProfile?.lud16 ?? ""} placeholder="org@wallet.com" />
                </Field>
              </div>
              <Field label="Website">
                <Input name="website" defaultValue={orgProfile?.website ?? ""} placeholder="https://example.com" />
              </Field>
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground-2">
                  signed with the org key · public to all of Nostr
                </span>
                <Button type="submit" disabled={busy === "orgprofile"}>
                  {busy === "orgprofile" ? "Proposing…" : "Propose profile change"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground-2">
                Creates a voted proposal; the profile is published with the org key automatically once it passes —
                an administrator must have the treasury unlocked then.
              </p>
            </form>
        </Section>
      )}

      <Section icon={Radio} title="Nostr relays" desc="Where governance events are published and read from.">
        {settings.relays.map((r) => (
          <div key={r} className="flex items-center justify-between rounded-md border border-border bg-bg-elev-2/40 px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--green)]" />
              <code className="text-sm font-mono truncate">{r}</code>
            </div>
            <button onClick={() => removeRelay(r)} className="text-muted-foreground hover:text-destructive transition shrink-0">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            value={newRelay}
            onChange={(e) => setNewRelay(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addRelay()}
            placeholder="wss://relay.example.com"
            className="flex-1 h-10 rounded-md border border-border bg-bg-elev-2/50 px-3 text-sm font-mono focus:outline-none focus:border-primary/60"
          />
          <button
            onClick={addRelay}
            className="h-10 px-4 shrink-0 rounded-md border border-border text-sm hover:border-border-bright hover:text-primary transition flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        <button
          onClick={() => setSettings({ relays: [...DEFAULT_RELAYS] })}
          className="text-xs text-primary hover:underline"
        >
          restore defaults
        </button>
      </Section>

      <Section icon={ImageIcon} title="Media servers" desc="Blossom servers (BUD-01/02) that store uploaded images and videos. Uploads are signed with your Nostr identity; the first server that accepts the blob wins.">
        {(settings.blossomServers ?? []).map((r) => (
          <div key={r} className="flex items-center justify-between rounded-md border border-border bg-bg-elev-2/40 px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--green)]" />
              <code className="text-sm font-mono truncate">{r}</code>
            </div>
            <button onClick={() => removeBlossom(r)} className="text-muted-foreground hover:text-destructive transition shrink-0">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            value={newBlossom}
            onChange={(e) => setNewBlossom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addBlossom()}
            placeholder="https://blossom.example.com"
            className="flex-1 h-10 rounded-md border border-border bg-bg-elev-2/50 px-3 text-sm font-mono focus:outline-none focus:border-primary/60"
          />
          <button
            onClick={addBlossom}
            className="h-10 px-4 shrink-0 rounded-md border border-border text-sm hover:border-border-bright hover:text-primary transition flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </Section>

      <Section icon={Bitcoin} title="Explorer API" desc="Esplora-compatible API for vault UTXOs and broadcast.">
        <div className="flex gap-2">
          <input
            value={explorer}
            onChange={(e) => setExplorer(e.target.value)}
            placeholder={settings.network === "REGTEST" ? "http://localhost:3000/api" : "https://mempool.space/api"}
            className="flex-1 h-10 rounded-md border border-border bg-bg-elev-2/50 px-3 text-sm font-mono focus:outline-none focus:border-primary/60"
          />
          <button
            onClick={saveExplorer}
            className="h-10 px-4 shrink-0 rounded-md border border-border text-sm hover:border-border-bright hover:text-primary transition"
          >
            Save
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground-2">
          Any esplora-compatible endpoint works. Empty resets to the network default.
        </p>
      </Section>

      <Section icon={Zap} title="Breez wallet" desc="The Breez API key is configured through the VITE_BREEZ_API_KEY environment variable in .env.">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check size={14} className="text-primary" />
          API key loaded from the app environment — no in-app setup required.
        </div>
      </Section>

      <Section icon={Shield} title="Multisig vault" desc="Threshold and signers for treasury custody.">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Threshold</label>
            <div className="mt-1.5 h-10 rounded-md border border-border bg-bg-elev-2/50 px-3 text-sm font-mono flex items-center">
              {org.config?.threshold ?? "–"}-of-{org.config?.vaultSigners.length ?? "–"}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Type</label>
            <div className="mt-1.5 h-10 rounded-md border border-border bg-bg-elev-2/50 px-3 text-sm font-mono flex items-center">Taproot</div>
          </div>
        </div>
        <div className="rounded-md border border-border bg-bg-elev-2/40 p-3 font-mono text-[11px] text-muted-foreground">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground-2 mb-2">
            thresh(CHECKSIGADD) signers
          </div>
          {(org.config?.vaultSigners ?? []).map((s) => (
            <div key={s} className="truncate">{s}</div>
          ))}
          {!org.config?.vaultSigners.length && <div>none published yet</div>}
        </div>
        <div className="font-mono text-[11px] text-muted-foreground break-all">
          vault address: {org.vault?.address ?? "incomplete"}
        </div>
      </Section>

      <Section icon={Key} title="Keys & backups" desc="Your personal key backup. The org seed is never shown or exported.">
        <div className="rounded-md border border-border bg-bg-elev-2/40 p-3 space-y-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground-2">
            Your key · {auth?.method ?? "—"}
          </div>
          <div className="font-mono text-[11px] text-muted-foreground break-all">{auth?.npub}</div>
          {auth?.mnemonic ? (
            <>
              <button
                onClick={() => setShowMySeed((s) => !s)}
                className="text-xs text-primary hover:underline"
              >
                {showMySeed ? "hide" : "reveal"} backup seed words
              </button>
              {showMySeed && (
                <div className="rounded-md border border-[var(--yellow)]/40 bg-[var(--yellow)]/5 p-3 space-y-2">
                  <div className="font-mono text-xs leading-relaxed break-all select-all">{auth.mnemonic}</div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => copy(auth.mnemonic!, "myseed")} className="text-xs text-primary hover:underline flex items-center gap-1">
                      {copied === "myseed" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} Copy
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-[11px] text-muted-foreground-2">
              No local backup available for this auth method (NIP-07 keys live in your extension).
            </div>
          )}
        </div>

        <div className="rounded-md border border-border bg-bg-elev-2/40 p-3 space-y-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground-2">
            Org treasury seed
          </div>
          <div className="text-[11px] leading-relaxed text-muted-foreground-2">
            The org seed is never displayed, copied or exported in plain text. Each administrator
            holds an encrypted share on Nostr, and the seed is only decrypted in memory — after
            unlocking the treasury — to sign org events and operate the wallet.
          </div>
        </div>
      </Section>

      <Section icon={LogOut} title="Session" desc="Leave this device. Your passkey stays available for the next sign-in.">
        <button
          onClick={handleSignOut}
          className="h-10 w-full rounded-md border border-destructive/40 text-sm font-medium text-destructive transition hover:bg-destructive/10"
        >
          Sign out
        </button>
      </Section>
    </div>
  );
}
