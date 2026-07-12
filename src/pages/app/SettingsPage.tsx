import { Shield, Radio, Key, Globe2, Bell, Trash2 } from "lucide-react";

function Section({ icon: Icon, title, desc, children }: { icon: any; title: string; desc: string; children: React.ReactNode }) {
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

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{label}</label>
      <input
        defaultValue={value}
        className="mt-1.5 w-full h-10 rounded-md border border-border bg-bg-elev-2/50 px-3 text-sm font-mono focus:outline-none focus:border-primary/60 transition"
      />
      {hint && <div className="text-[11px] text-muted-foreground-2 mt-1">{hint}</div>}
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-serif italic">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Configure your DAO, signers, and relays.</p>
      </div>

      <Section icon={Globe2} title="Organization" desc="How your DAO presents itself to the world.">
        <Field label="Name" value="Plebs Label" />
        <Field label="Handle" value="plebs-label" hint="plebs-label.sovereign.dao" />
        <Field label="Description" value="A music co-op coordinating budgets and royalties on Bitcoin." />
      </Section>

      <Section icon={Shield} title="Multisig vault" desc="Threshold and signers for treasury custody.">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Threshold</label>
            <div className="mt-1.5 h-10 rounded-md border border-border bg-bg-elev-2/50 px-3 text-sm font-mono flex items-center">3-of-5</div>
          </div>
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Type</label>
            <div className="mt-1.5 h-10 rounded-md border border-border bg-bg-elev-2/50 px-3 text-sm font-mono flex items-center">Taproot</div>
          </div>
        </div>
        <div className="rounded-md border border-border bg-bg-elev-2/40 p-3 font-mono text-[11px] text-muted-foreground">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground-2 mb-2">Policy</div>
          thresh(3, pk(@satoshi), pk(@lina), pk(@marc), pk(@kai), pk(@yuki))
        </div>
        <button className="text-xs text-primary hover:underline">Rotate signer →</button>
      </Section>

      <Section icon={Radio} title="Nostr relays" desc="Where governance events are published and read from.">
        {["wss://relay.damus.io", "wss://nos.lol", "wss://relay.snort.social"].map((r) => (
          <div key={r} className="flex items-center justify-between rounded-md border border-border bg-bg-elev-2/40 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--green)]" />
              <code className="text-sm font-mono">{r}</code>
            </div>
            <button className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        <button className="text-xs text-primary hover:underline">+ Add relay</button>
      </Section>

      <Section icon={Key} title="API & webhooks" desc="Programmatic access to DAO events.">
        <Field label="API key" value="sk_live_a8f2…m9q4" />
        <Field label="Webhook URL" value="https://yourapp.com/dao/events" />
      </Section>

      <Section icon={Bell} title="Notifications" desc="What gets pinged to your inbox.">
        {["New proposal opened", "Quorum reached", "Treasury moved", "New member joined"].map((n, i) => (
          <label key={n} className="flex items-center justify-between gap-3 py-1">
            <span className="text-sm">{n}</span>
            <input type="checkbox" defaultChecked={i < 3} className="h-4 w-4 accent-[var(--primary)]" />
          </label>
        ))}
      </Section>
    </div>
  );
}