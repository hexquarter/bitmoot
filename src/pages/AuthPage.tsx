import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Fingerprint, KeyRound, Puzzle, ShieldCheck, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import {
  registerPasskey,
  unlockPasskey,
  signInWithNsec,
  signInWithNip07,
  signInWithMnemonic,
  hasStoredPasskey,
  lastMethod,
} from "../lib/auth";

/**
 * Auth gateway: passkey (WebAuthn PRF → NIP-06 key), nsec, NIP-07 extension,
 * or restoring a seed backup.
 */
export function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [nsec, setNsec] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [showRestore, setShowRestore] = useState(false);
  const hasPasskey = hasStoredPasskey();

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
      navigate("/app");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border px-6 h-16 flex items-center justify-between">
        <Link to="/" className="font-mono font-semibold tracking-[0.14em] text-[15px]">
          BIT<span className="font-light">MOOT</span><b className="text-primary">.</b>
        </Link>
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground-2">
          Sovereign auth · no servers
        </span>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-primary-dim border border-primary/30 mb-4">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-3xl font-serif italic">Sign in to BitMoot</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your key is your identity. Nothing leaves this device except signed Nostr events.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-bg-elev-1 p-5 space-y-4">
            <button
              disabled={busy !== null}
              onClick={() => run("passkey-create", () => registerPasskey("BitMoot member"))}
              className="w-full h-11 rounded-md bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-50"
            >
              <Fingerprint className="h-4 w-4" />
              {busy === "passkey-create" ? "Creating passkey…" : "Create a passkey"}
            </button>
            {hasPasskey && (
              <button
                disabled={busy !== null}
                onClick={() => run("passkey-unlock", unlockPasskey)}
                className="w-full h-11 rounded-md border border-primary/40 text-primary text-sm flex items-center justify-center gap-2 hover:bg-primary-dim transition disabled:opacity-50"
              >
                <Fingerprint className="h-4 w-4" />
                {busy === "passkey-unlock" ? "Unlocking…" : "Continue with passkey"}
              </button>
            )}
            <p className="text-[11px] text-muted-foreground-2 font-mono leading-relaxed">
              PASSKEY → PRF EXTENSION → DETERMINISTIC SEED → NIP-06 NOSTR KEY (m/44'/1237'/0'/0/0)
            </p>
          </div>

          <div className="rounded-lg border border-border bg-bg-elev-1 p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <KeyRound className="h-4 w-4 text-primary" /> Sign in with nsec
            </div>
            <input
              type="password"
              value={nsec}
              onChange={(e) => setNsec(e.target.value)}
              placeholder="nsec1…"
              className="w-full h-10 rounded-md border border-border bg-bg-elev-2 px-3 text-sm font-mono focus:outline-none focus:border-primary/60"
            />
            <button
              disabled={busy !== null || !nsec.trim()}
              onClick={() => run("nsec", () => signInWithNsec(nsec))}
              className="w-full h-10 rounded-md border border-border text-sm hover:border-primary/50 hover:text-primary transition disabled:opacity-50"
            >
              {busy === "nsec" ? "Signing in…" : "Use secret key"}
            </button>
          </div>

          <div className="rounded-lg border border-border bg-bg-elev-1 p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Puzzle className="h-4 w-4 text-primary" /> Browser extension (NIP-07)
            </div>
            <p className="text-[11px] text-muted-foreground">
              Alby, nos2x or any NIP-07 extension. The key never touches this page.
            </p>
            <button
              disabled={busy !== null}
              onClick={() => run("nip07", signInWithNip07)}
              className="w-full h-10 rounded-md border border-border text-sm hover:border-primary/50 hover:text-primary transition disabled:opacity-50"
            >
              {busy === "nip07" ? "Connecting…" : "Connect extension"}
            </button>
          </div>

          {showRestore ? (
            <div className="rounded-lg border border-border bg-bg-elev-1 p-5 space-y-3">
              <div className="text-sm font-medium">Restore from seed words</div>
              <textarea
                value={mnemonic}
                onChange={(e) => setMnemonic(e.target.value)}
                rows={3}
                placeholder="12 or 24 BIP-39 words backing up your passkey or org identity…"
                className="w-full rounded-md border border-border bg-bg-elev-2 px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/60 resize-none"
              />
              <button
                disabled={busy !== null || !mnemonic.trim()}
                onClick={() => run("mnemonic", () => signInWithMnemonic(mnemonic))}
                className="w-full h-10 rounded-md border border-border text-sm hover:border-primary/50 hover:text-primary transition disabled:opacity-50"
              >
                {busy === "mnemonic" ? "Restoring…" : "Restore key"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowRestore(true)}
              className="w-full text-xs text-muted-foreground hover:text-primary transition flex items-center justify-center gap-1"
            >
              Lost access? Restore from seed backup <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </main>

      <footer className="border-t border-border px-6 py-3 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground-2">
        <span>BLOCKMOOT EXPERIMENTAL · USE SMALL AMOUNTS</span>
        {lastMethod() && <span>LAST SIGN-IN: {lastMethod().toUpperCase()}</span>}
      </footer>
    </div>
  );
}
