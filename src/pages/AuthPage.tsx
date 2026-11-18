import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ChevronDown,
  Fingerprint,
  KeyRound,
  Puzzle,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  registerPasskey,
  unlockPasskey,
  signInWithNsec,
  signInWithNip07,
  signInWithMnemonic,
  hasStoredPasskey,
  useAuth,
} from "../lib/auth";
import { Button, Card, Field, Input, inputClass } from "../components/ui";

/** Passkey-first sign in. Nostr keys and seed words live under Advanced. */
export function AuthPage() {
  const navigate = useNavigate();
  const signer = useAuth().signer;
  const [busy, setBusy] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [nsec, setNsec] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [showRestore, setShowRestore] = useState(false);
  const hasPasskey = hasStoredPasskey();

  // The app gate restores the session before routing; send restored users on.
  useEffect(() => {
    if (signer) navigate("/app", { replace: true });
  }, [signer, navigate]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
      navigate("/app", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-16 items-center justify-between border-b border-border px-6">
        <Link to="/" className="font-mono font-semibold tracking-[0.14em] text-[15px]">
          BIT<span className="font-light">MOOT</span><b className="text-primary">.</b>
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground-2">
          Simple. Private. Yours.
        </span>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-md border border-primary/30 bg-primary-dim">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-3xl font-serif italic">Welcome to BitMoot</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Manage your group's money and decisions. No password, no account to create.
            </p>
          </div>

          <Card className="space-y-3 p-5">
            <Button
              variant="primary"
              className="h-12 w-full"
              disabled={busy !== null}
              onClick={() => run("existing", unlockPasskey)}
            >
              <Fingerprint className="h-5 w-5" />
              {busy === "existing"
                ? "Checking…"
                : hasPasskey
                  ? "Continue with passkey"
                  : "Sign in with an existing passkey"}
            </Button>
            <p className="text-center text-[11px] leading-relaxed text-muted-foreground-2">
              {hasPasskey
                ? "Use your face, fingerprint or device PIN."
                : "Use a passkey you already created, including one synced from another device."}
            </p>

            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-border" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground-2">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button
              variant="secondary"
              className="w-full"
              disabled={busy !== null}
              onClick={() => run("create", () => registerPasskey("BitMoot member"))}
            >
              <ShieldCheck className="h-4 w-4" />
              {busy === "create" ? "Creating your passkey…" : "Create a new passkey"}
            </Button>
            <p className="text-center text-[11px] leading-relaxed text-muted-foreground-2">
              Face ID, Touch ID or Windows Hello. Your key never leaves this device.
            </p>
          </Card>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setAdvanced((value) => !value)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-primary"
            >
              Already have a Nostr key? Advanced sign-in
              <ChevronDown className={"h-3.5 w-3.5 transition " + (advanced ? "rotate-180" : "")} />
            </button>
          </div>

          {advanced && (
            <div className="space-y-4">
              <Card className="space-y-3 p-5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Puzzle className="h-4 w-4 text-primary" /> Nostr extension
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Connect Alby or another NIP-07 extension. The key stays in the extension.
                </p>
                <Button
                  className="w-full"
                  disabled={busy !== null}
                  onClick={() => run("nip07", signInWithNip07)}
                >
                  {busy === "nip07" ? "Connecting…" : "Connect extension"}
                </Button>
              </Card>

              <Card className="space-y-3 p-5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <KeyRound className="h-4 w-4 text-primary" /> Secret key (nsec)
                </div>
                <Input
                  type="password"
                  value={nsec}
                  onChange={(e) => setNsec(e.target.value)}
                  placeholder="nsec1…"
                  className="font-mono"
                />
                <Button
                  className="w-full"
                  disabled={busy !== null || !nsec.trim()}
                  onClick={() => run("nsec", () => signInWithNsec(nsec))}
                >
                  {busy === "nsec" ? "Signing in…" : "Use secret key"}
                </Button>
              </Card>

              {showRestore ? (
                <Card className="space-y-3 p-5">
                  <Field label="Seed words">
                    <textarea
                      value={mnemonic}
                      onChange={(e) => setMnemonic(e.target.value)}
                      rows={3}
                      placeholder="12 or 24 words from your backup"
                      className={inputClass + " h-auto resize-none py-2 font-mono"}
                    />
                  </Field>
                  <Button
                    className="w-full"
                    disabled={busy !== null || !mnemonic.trim()}
                    onClick={() => run("mnemonic", () => signInWithMnemonic(mnemonic))}
                  >
                    {busy === "mnemonic" ? "Restoring…" : "Restore key"}
                  </Button>
                </Card>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowRestore(true)}
                  className="mx-auto flex items-center gap-1 text-xs text-muted-foreground transition hover:text-primary"
                >
                  Restore from seed words <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-border px-6 py-3 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground-2">
        No servers. No passwords. Keys stay on this device.
      </footer>
    </div>
  );
}
