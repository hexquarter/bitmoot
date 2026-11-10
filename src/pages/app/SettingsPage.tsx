import { useState } from "react";
import { toast } from "sonner";
import { Shield, Radio, Key, Globe2, Trash2, Plus, Check, Copy, Bitcoin, Zap, FileWarning, type LucideIcon } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { lockTreasury, npubToHex, treasurySeed, useOrg } from "../../lib/org";
import { setSettings, useSettings, DEFAULT_RELAYS, type SparkNetwork } from "../../lib/settings";
import { disconnectOrgWallet } from "../../lib/spark";

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
  const org = useOrg();
  const auth = useAuth().signer;
  const settings = useSettings();

  const [orgNpub, setOrgNpub] = useState(settings.activeOrgNpub ?? "");
  const [newRelay, setNewRelay] = useState("");
  const [explorer, setExplorer] = useState(settings.explorerApiBase ?? "");
  const [showSeed, setShowSeed] = useState(false);
  const [showMySeed, setShowMySeed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const seed = treasurySeed();

  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(null), 2000);
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

  const saveExplorer = () => {
    setSettings({ explorerApiBase: explorer.trim() || undefined });
    toast.success("Explorer API saved");
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-serif italic">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Network, relays, org, and keys.</p>
      </div>

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

      <Section icon={Key} title="Keys & backups" desc="Your key and the org treasury seed. Handle with care.">
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
          {seed ? (
            <>
              <button onClick={() => setShowSeed((s) => !s)} className="text-xs text-primary hover:underline">
                {showSeed ? "hide" : "reveal"} org seed
              </button>
              {showSeed && (
                <div className="rounded-md border border-[var(--yellow)]/40 bg-[var(--yellow)]/5 p-3 space-y-2">
                  <div className="font-mono text-xs leading-relaxed break-all select-all">{seed}</div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => copy(seed, "orgseed")} className="text-xs text-primary hover:underline flex items-center gap-1">
                      {copied === "orgseed" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} Copy
                    </button>
                    <button
                      onClick={() => {
                        const blob = new Blob([seed], { type: "text/plain" });
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(blob);
                        a.download = "bitmoot-org-seed.txt";
                        a.click();
                        URL.revokeObjectURL(a.href);
                      }}
                      className="text-xs text-primary hover:underline"
                    >
                      Download
                    </button>
                  </div>
                  <div className="flex items-start gap-2 text-[11px] text-[var(--yellow)]">
                    <FileWarning className="h-3.5 w-3.5 shrink-0 mt-px" />
                    These 24 words control the org treasury. Store offline.
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-[11px] text-muted-foreground-2">
              Treasury locked — unlock it on the treasury page to reveal the org seed.
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
