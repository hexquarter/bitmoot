import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Plus, Vote, CheckCircle2, Clock, Gavel, Send, FileSignature, ExternalLink,
  Eye, X, Code2, RefreshCw, Shield, ArrowRight,
} from "lucide-react";
import { useAuth } from "../../lib/auth";
import { canPayDirectly, executeApprovedPayment } from "../../lib/autoPay";
import { platformFeeDisplay } from "../../lib/fees";
import {
  canExecuteConfigChange, castVote, configChangeSummary, createProposal, createVaultSpend, cosignVaultSpend,
  executeConfigChange, executeVaultSpend, getProposalDebugDetails, listVaultSignatures, proposeConfigChange,
  proposalPaymentMethod, shortNpub, useOrg,
  type ConfigChangeInput, type ContentPermission, type PaymentMethod, type ProposalDebugDetails, type ProposalView,
  type VaultSignatureView, type VoteChoice,
} from "../../lib/org";
import { parseJsonContent, type NostrEvent } from "../../lib/nostr";
import { profileLabel, profileSubtitle, useProfiles } from "../../lib/profile";
import { setSettings, useSettings } from "../../lib/settings";
import { explorerUiBase } from "../../lib/vault";
import { CopyButton } from "../../components/ui";
import { OrgWalletNote } from "../../components/OrgWalletNote";

const statusStyle: Record<string, string> = {
  voting: "border-primary/30 text-primary bg-primary-dim",
  passed: "border-[var(--green)]/30 text-[var(--green)] bg-[var(--green)]/10",
  executed: "border-[var(--blue)]/30 text-[var(--blue)] bg-[var(--blue)]/10",
};

const statusIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  voting: Vote,
  passed: CheckCircle2,
  executed: Clock,
};

const paymentLabels: Record<PaymentMethod, string> = {
  lightning: "Lightning",
  usdb: "USDB",
  onchain: "On-chain",
};

function paymentSummary(proposal: ProposalView): string | null {
  const method = proposalPaymentMethod(proposal);
  if (!method) return null;
  const amount =
    method === "usdb"
      ? proposal.amountUsd != null
        ? `${Number(proposal.amountUsd).toLocaleString("en-US")} USD`
        : ""
      : proposal.amountSats != null
        ? `${Number(proposal.amountSats).toLocaleString("en-US")} sats`
        : "";
  return [paymentLabels[method], amount].filter(Boolean).join(" · ");
}

type Filter = "all" | "open" | "passed" | "executed";

function NewProposal({ onDone }: { onDone: () => void }) {
  const org = useOrg();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<"payment" | "general" | "config">("payment");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("lightning");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  // governance (config) change fields
  const [action, setAction] = useState<ConfigChangeInput["action"]>("setThreshold");
  const [threshold, setThreshold] = useState(String(org.config?.threshold ?? 2));
  const [signerKey, setSignerKey] = useState("");
  const [memberNpub, setMemberNpub] = useState("");
  const [memberKey, setMemberKey] = useState("");
  const [removeMemberNpub, setRemoveMemberNpub] = useState("");
  const [removeKey, setRemoveKey] = useState("");
  const [permFeedPost, setPermFeedPost] = useState<ContentPermission>((org.config?.permissions?.feedPost ?? "admins"));
  const [permCreateProposal, setPermCreateProposal] = useState<ContentPermission>((org.config?.permissions?.createProposal ?? "members"));

  const recipientLabels: Record<PaymentMethod, string> = {
    lightning: "Lightning invoice",
    usdb: "Recipient Spark address",
    onchain: "Bitcoin address",
  };
  const recipientPlaceholders: Record<PaymentMethod, string> = {
    lightning: "lnbc…",
    usdb: "sp1p…",
    onchain: "bc1…",
  };

  const governanceCandidates = (() => {
    // Vault keys not attributable to another member's published key — the ones
    // that could belong to the member being removed.
    const others = new Set(
      org.members
        .filter((m) => m.pubkey !== removeMemberNpub)
        .map((m) => m.vaultXOnly)
        .filter((k): k is string => Boolean(k)),
    );
    return (org.config?.vaultSigners ?? []).filter((k) => !others.has(k));
  })();

  const submit = async () => {
    if (type === "config") {
      setBusy(true);
      try {
        const change: ConfigChangeInput =
          action === "setThreshold"
            ? { action, threshold: Number(threshold.replace(/[,\s]/g, "")) }
            : action === "addSigner"
              ? { action, xOnly: signerKey.trim() }
              : action === "removeSigner"
                ? { action, xOnly: signerKey.trim() }
                : action === "addMember"
                  ? {
                      action,
                      memberNpub: memberNpub.trim(),
                      memberXOnly: memberKey.trim() || undefined,
                    }
                : action === "setPermissions"
                  ? {
                      action,
                      permissions: {
                        feedPost: permFeedPost,
                        createProposal: permCreateProposal,
                      },
                    }
                  : {
                      action,
                      memberNpub: removeMemberNpub.trim(),
                      removeXOnly: removeKey || undefined,
                    };
        await proposeConfigChange(change);
        toast.success("Governance proposal published to Nostr");
        onDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!title.trim()) return toast.error("Give the proposal a title");
    if (type === "payment" && !recipient.trim()) return toast.error("Add the payment recipient");
    if (type === "payment" && paymentMethod !== "lightning" && !Number(amount)) {
      return toast.error("Add an amount for this payment");
    }
    setBusy(true);
    try {
      await createProposal({
        title: title.trim(),
        body: body.trim(),
        type,
        paymentMethod: type === "payment" ? paymentMethod : undefined,
        payee: type === "payment" ? recipient.trim() : undefined,
        amountSats:
          type === "payment" && paymentMethod !== "usdb" ? Number(amount) || undefined : undefined,
        amountUsd:
          type === "payment" && paymentMethod === "usdb" ? Number(amount) || undefined : undefined,
        onchainAddress:
          type === "payment" && paymentMethod === "onchain" ? recipient.trim() : undefined,
      });
      toast.success("Proposal published to Nostr");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full h-10 rounded-md border border-border bg-bg-elev-2/50 px-3 text-sm focus:outline-none focus:border-primary/60 transition";

  return (
    <div className="rounded-lg border border-border bg-bg-elev-1/50 p-6 space-y-4 max-w-2xl">
      <div className="flex items-center gap-2 font-medium"><Plus className="h-4 w-4 text-primary" /> New proposal</div>
      <div>
        <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pay Lina for the mixing studio"
          className={inputCls} />
      </div>
      <div>
        <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Body</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Context for the council…"
          className="w-full rounded-md border border-border bg-bg-elev-2/50 px-3 py-2 text-sm focus:outline-none focus:border-primary/60 transition resize-none" />
      </div>
      <div className="flex gap-2">
        {(["payment", "general", "config"] as const).map((t) => (
          <button key={t} onClick={() => setType(t)}
            className={"h-9 px-4 rounded-md text-xs font-mono uppercase tracking-wider border transition " +
              (type === t ? "border-primary/50 bg-primary-dim text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
            {t === "config" ? "governance" : t}
          </button>
        ))}
      </div>
      {type === "config" && (
        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Change</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(
                [
                  ["setThreshold", "Change threshold"],
                  ["addSigner", "Add signer"],
                  ["removeSigner", "Remove signer"],
                  ["addMember", "Add member"],
                  ["removeMember", "Remove member"],
                  ["setPermissions", "Permissions"],
                ] as const
              ).map(([a, label]) => (
                <button key={a} onClick={() => setAction(a)}
                  className={"h-9 px-3 rounded-md text-xs font-medium border transition " +
                    (action === a
                      ? "border-primary/60 bg-primary-dim text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-border-bright")}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {action === "setThreshold" && (
            <div className="max-w-xs">
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                New threshold (of {org.config?.vaultSigners.length ?? "N"} published signers)
              </label>
              <input value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="numeric"
                placeholder="2" className={inputCls + " font-mono mt-1.5"} />
            </div>
          )}

          {(action === "addSigner" || action === "removeSigner") && (
            <div className="max-w-2xl">
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                {action === "addSigner" ? "Vault signer key to add (x-only, 64 hex)" : "Vault signer key to remove"}
              </label>
              {action === "addSigner" ? (
                <input value={signerKey} onChange={(e) => setSignerKey(e.target.value)}
                  placeholder="64 hex characters, no 02/03 prefix" className={inputCls + " font-mono mt-1.5"} />
              ) : (
                <select value={signerKey} onChange={(e) => setSignerKey(e.target.value)}
                  className={inputCls + " font-mono mt-1.5"}>
                  <option value="">Choose a signer key…</option>
                  {(org.config?.vaultSigners ?? []).map((k) => (
                    <option key={k} value={k}>{k.slice(0, 16)}…{k.slice(-8)}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {action === "addMember" && (
            <div className="space-y-3 max-w-2xl">
              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Member npub</label>
                <input value={memberNpub} onChange={(e) => setMemberNpub(e.target.value)} placeholder="npub1…"
                  className={inputCls + " font-mono mt-1.5"} />
              </div>
              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Optional: their vault signer key (if they sent it to you)
                </label>
                <input value={memberKey} onChange={(e) => setMemberKey(e.target.value)}
                  placeholder="64 hex characters" className={inputCls + " font-mono mt-1.5"} />
              </div>
            </div>
          )}

          {action === "removeMember" && (
            <div className="space-y-3 max-w-2xl">
              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Member to remove</label>
                <select value={removeMemberNpub} onChange={(e) => { setRemoveMemberNpub(e.target.value); setRemoveKey(""); }}
                  className={inputCls + " font-mono mt-1.5"}>
                  <option value="">Choose a member…</option>
                  {org.members.map((m) => (
                    <option key={m.pubkey} value={m.pubkey}>{shortNpub(m.pubkey)}</option>
                  ))}
                </select>
              </div>
              {removeMemberNpub && governanceCandidates.length > 0 && (
                <div>
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Also remove a vault signer key linked to them (optional)
                  </label>
                  <select value={removeKey} onChange={(e) => setRemoveKey(e.target.value)}
                    className={inputCls + " font-mono mt-1.5"}>
                    <option value="">— none —</option>
                    {governanceCandidates.map((k) => (
                      <option key={k} value={k}>{k.slice(0, 16)}…{k.slice(-8)}</option>
                    ))}
                  </select>
                </div>
              )}
              <p className="text-[11px] text-[var(--yellow)]">
                Removing a member takes away their vote and vault key. It cannot revoke the encrypted seed share
                already on relays — if the membership was compromised, rotate the wallet seed instead (treasury page).
              </p>
            </div>
          )}

          {action === "setPermissions" && (
            <div className="space-y-3 max-w-xl">
              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Posting to the org feed
                </label>
                <select value={permFeedPost} onChange={(e) => setPermFeedPost(e.target.value as ContentPermission)}
                  className={inputCls + " mt-1.5"}>
                  <option value="admins">Administrators only</option>
                  <option value="members">All members</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Creating proposals
                </label>
                <select value={permCreateProposal} onChange={(e) => setPermCreateProposal(e.target.value as ContentPermission)}
                  className={inputCls + " mt-1.5"}>
                  <option value="members">All members</option>
                  <option value="admins">Administrators only</option>
                </select>
              </div>
            </div>
          )}

          {action !== "removeMember" && (
            <p className="text-[11px] text-muted-foreground-2">
              Governance changes apply automatically when the proposal gathers the current threshold of yes-votes;
              an administrator must have the treasury unlocked so the org key can sign the new config.
              Threshold and signer changes derive a new vault address.
            </p>
          )}
        </div>
      )}
      {type !== "config" && (
        <>
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pay Lina for the mixing studio"
              className={inputCls} />
          </div>
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Body</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Context for the council…"
              className="w-full rounded-md border border-border bg-bg-elev-2/50 px-3 py-2 text-sm focus:outline-none focus:border-primary/60 transition resize-none" />
          </div>
        </>
      )}
      {type === "payment" && (
        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Payment method</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(["lightning", "usdb", "onchain"] as const).map((m) => (
                <button key={m} onClick={() => setPaymentMethod(m)}
                  className={"h-9 px-3 rounded-md text-xs font-medium border transition " +
                    (paymentMethod === m
                      ? "border-primary/60 bg-primary-dim text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-border-bright")}>
                  {paymentLabels[m]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                {paymentMethod === "usdb" ? "Amount (USD)" : "Amount (sats)"}
                {paymentMethod === "lightning" && " — optional"}
              </label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)}
                inputMode={paymentMethod === "usdb" ? "decimal" : "numeric"}
                placeholder={paymentMethod === "usdb" ? "420.00" : "4200000"}
                className={inputCls + " font-mono"} />
            </div>
            <div>
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                {recipientLabels[paymentMethod]}
              </label>
              <input value={recipient} onChange={(e) => setRecipient(e.target.value)}
                placeholder={recipientPlaceholders[paymentMethod]} className={inputCls + " font-mono"} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground-2">
            Funds stay locked until this proposal passes. Then the exact recipient and amount are unlocked on the Payments page.
          </p>
        </div>
      )}
      <button onClick={submit} disabled={busy}
        className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90 transition disabled:opacity-50">
        <Send className="h-4 w-4" /> {busy ? "Publishing…" : "Publish proposal"}
      </button>
    </div>
  );
}

function VoteButtons({ proposal, voted }: { proposal: ProposalView; voted: VoteChoice | null }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const vote = async (choice: VoteChoice) => {
    setBusy(choice);
    try {
      await castVote(proposal.id, choice);
      toast.success(`Voted ${choice}`);
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (voted && !editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary-dim/40 px-3 py-2">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <span className="text-xs text-muted-foreground">
          You voted <strong className="text-foreground capitalize">{voted}</strong>
        </span>
        <button onClick={() => setEditing(true)} className="text-xs font-medium text-primary hover:underline">
          Change vote
        </button>
      </div>
    );
  }

  const action =
    "h-9 px-4 rounded-md text-sm font-medium flex items-center justify-center gap-1.5 transition disabled:opacity-50";

  return (
    <div className="w-full rounded-md sm:w-auto">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-primary">
        <Vote className="h-4 w-4" /> {voted ? "Change your vote" : "Your vote is needed"}
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => vote("yes")} disabled={busy !== null}
          className={action + " bg-primary text-primary-foreground hover:opacity-90"}>
          <CheckCircle2 className="h-4 w-4" /> {busy === "yes" ? "Saving…" : "Vote yes"}
        </button>
        <button onClick={() => vote("no")} disabled={busy !== null}
          className={action + " border border-destructive/40 text-destructive hover:bg-destructive/10"}>
          {busy === "no" ? "Saving…" : "Vote no"}
        </button>
        <button onClick={() => vote("abstain")} disabled={busy !== null}
          className={action + " border border-border bg-bg-elev-2/50 text-foreground hover:border-border-bright"}>
          {busy === "abstain" ? "Saving…" : "Abstain"}
        </button>
      </div>
      {voted && (
        <button onClick={() => setEditing(false)} className="mt-2 text-[11px] text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      )}
    </div>
  );
}

/** Direct fallback when automatic submission did not go through. */
function MakePaymentButton({ proposal }: { proposal: ProposalView }) {
  const [busy, setBusy] = useState(false);
  const pay = async () => {
    setBusy(true);
    try {
      const reference = await executeApprovedPayment(proposal);
      toast.success(`Payment sent · ${reference.slice(0, 16)}…`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={pay}
      disabled={busy}
      className="h-9 px-3 rounded-md bg-[var(--green)]/15 border border-[var(--green)]/30 text-xs font-medium text-[var(--green)] hover:opacity-90 transition flex items-center gap-2 disabled:opacity-50"
    >
      <Send className="h-3.5 w-3.5" /> {busy ? "Sending…" : "Make the payment"}
    </button>
  );
}

/** Apply a passed configuration change (threshold / signer / member). */
function ApplyConfigButton({ proposal }: { proposal: ProposalView }) {
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    setBusy(true);
    try {
      const summary = await executeConfigChange(proposal);
      toast.success(`Change applied · ${summary}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={apply}
      disabled={busy}
      className="h-9 px-3 rounded-md bg-[var(--green)]/15 border border-[var(--green)]/30 text-xs font-medium text-[var(--green)] hover:opacity-90 transition flex items-center gap-2 disabled:opacity-50"
    >
      <Gavel className="h-3.5 w-3.5" /> {busy ? "Applying…" : "Apply change"}
    </button>
  );
}

function SpendActions({ proposal }: { proposal: ProposalView }) {
  const org = useOrg();
  const [busy, setBusy] = useState<string | null>(null);
  const threshold = org.config?.threshold ?? 0;

  const create = async () => {
    setBusy("create");
    try {
      await createVaultSpend(proposal);
      toast.success("PSBT built, signed and published for co-signing");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const cosign = async () => {
    setBusy("cosign");
    try {
      await cosignVaultSpend(proposal);
      toast.success("Co-signature published");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const execute = async () => {
    setBusy("execute");
    try {
      const txid = await executeVaultSpend(proposal);
      toast.success(`Broadcast: ${txid}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const btn =
    "h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-50";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {proposal.psbtSigs === 0 ? (
        <button onClick={create} disabled={busy !== null}
          className={btn + " border border-border text-foreground hover:border-border-bright"}>
          <FileSignature className="h-3.5 w-3.5" /> {busy === "create" ? "Building…" : "Prepare vault spend"}
        </button>
      ) : (
        <>
          <button onClick={cosign} disabled={busy !== null}
            className={btn + " border border-border text-foreground hover:border-border-bright"}>
            <FileSignature className="h-3.5 w-3.5" /> {busy === "cosign" ? "Signing…" : "Co-sign"}
          </button>
          <button onClick={execute} disabled={busy !== null}
            className={btn + " bg-primary text-primary-foreground hover:opacity-90"}>
            <Send className="h-3.5 w-3.5" /> {busy === "execute" ? "Broadcasting…" : "Execute"}
          </button>
          <span className="text-[10px] font-mono text-muted-foreground-2">{proposal.psbtSigs} co-signed</span>
        </>
      )}
      {proposal.psbtSigs > 0 && proposal.psbtSigs < threshold && (
        <span className="text-[10px] font-mono text-[var(--yellow)]">needs {threshold - proposal.psbtSigs} more</span>
      )}
    </div>
  );
}

/** Shows every vault signer and who has published a signature. */
function SignatureRoster({ proposalId }: { proposalId: string }) {
  const [signatures, setSignatures] = useState<VaultSignatureView[]>([]);
  const profiles = useProfiles(signatures.map((s) => s.author).filter((a): a is string => Boolean(a)));

  useEffect(() => {
    let active = true;
    listVaultSignatures(proposalId)
      .then((result) => {
        if (active) setSignatures(result);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [proposalId]);

  if (!signatures.length) return null;
  return (
    <div className="w-full rounded-md border border-border bg-bg-elev-2/30 p-3">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Vault signatures ({signatures.filter((s) => s.signed).length}/{signatures.length})
      </div>
      <div className="flex flex-wrap gap-2">
        {signatures.map((s) => (
          <span
            key={s.signerXOnly}
            className={
              "inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[10px] " +
              (s.signed
                ? "border-[var(--green)]/30 bg-[var(--green)]/10 text-[var(--green)]"
                : "border-border text-muted-foreground-2")
            }
          >
            {s.signed ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            <span title={s.author ? profileSubtitle(profiles[s.author]) || undefined : undefined}>
              {s.author ? profileLabel(s.author, profiles[s.author]) : `${s.signerXOnly.slice(0, 8)}…`}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ReviewStat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-bg-elev-2/40 px-3 py-2.5">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground-2">{label}</div>
      <div className={"mt-1 text-xs text-foreground " + (mono ? "break-all font-mono" : "")}>{value}</div>
    </div>
  );
}

/** Keep PSBTs readable in the raw event view; full event JSON stays one click away. */
function eventPreview(event: NostrEvent): string {
  const parsed = parseJsonContent<Record<string, unknown>>(event);
  if (parsed && typeof parsed.psbt === "string") {
    const psbt = parsed.psbt;
    const preview = {
      ...parsed,
      psbt: `${psbt.slice(0, 120)}… (${psbt.length} chars)`,
    };
    return JSON.stringify({ ...event, content: JSON.stringify(preview) }, null, 2);
  }
  return JSON.stringify(event, null, 2);
}

function JsonBlock({ title, events }: { title: string; events: NostrEvent[] }) {
  if (!events.length) return null;
  return (
    <div className="space-y-3">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground-2">
        {title} ({events.length})
      </div>
      {events.map((event) => (
        <div key={event.id} className="rounded-md border border-border bg-bg-elev-2/30 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 font-mono text-[10px] text-muted-foreground-2">
              <span className="text-muted-foreground">id</span> {event.id.slice(0, 16)}… · kind {event.kind} ·{" "}
              {new Date(event.created_at * 1000).toLocaleString()}
            </div>
            <CopyButton
              value={JSON.stringify(event, null, 2)}
              label="Copy event"
              title="Copy full Nostr event"
              className="h-6 shrink-0 px-2 text-[10px]"
            />
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-muted-foreground">
            {eventPreview(event)}
          </pre>
        </div>
      ))}
    </div>
  );
}

function SignatureDetails({
  signatures,
  threshold,
  onchainOnly = false,
}: {
  signatures: VaultSignatureView[];
  threshold: number;
  onchainOnly?: boolean;
}) {
  const signed = signatures.filter((s) => s.signed).length;
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="border-b border-border bg-bg-elev-2/40 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Vault signatures ({signed}/{threshold || "M"} required){onchainOnly ? " · on-chain only" : ""}
      </div>
      <div className="divide-y divide-border">
        {signatures.map((sig) => (
          <div key={sig.signerXOnly} className="grid grid-cols-1 gap-1 px-3 py-2 text-[10px] font-mono sm:grid-cols-4">
            <div className="break-all text-muted-foreground" title={sig.signerXOnly}>
              {sig.signerXOnly.slice(0, 18)}…
            </div>
            <div className="text-muted-foreground">{sig.author ? shortNpub(sig.author) : "—"}</div>
            <div className={sig.signed ? "text-[var(--green)]" : "text-muted-foreground-2"}>
              {sig.signed ? `signed · ${sig.sigs} sig${sig.sigs === 1 ? "" : "s"}` : "not signed"}
            </div>
            <div className="text-muted-foreground-2">
              {sig.createdAt ? new Date(sig.createdAt * 1000).toLocaleString() : "—"}
            </div>
          </div>
        ))}
        {!signatures.length && (
          <div className="px-3 py-3 text-[11px] text-muted-foreground">No vault signers published yet.</div>
        )}
      </div>
    </div>
  );
}

function ProposalReviewDialog({ proposal, onClose }: { proposal: ProposalView; onClose: () => void }) {
  const org = useOrg();
  const auth = useAuth().signer;
  const settings = useSettings();
  const [details, setDetails] = useState<ProposalDebugDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const advanced = Boolean(settings.advancedMode);

  const load = useCallback(async () => {
    setLoadingDetails(true);
    try {
      setDetails(await getProposalDebugDetails(proposal.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingDetails(false);
    }
  }, [proposal.id]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const status = proposal.executed ? "executed" : proposal.passed ? "passed" : "voting";
  const StatusIcon = statusIcon[status];
  const canPropose = org.myRole === "admin" || org.myRole === "member";
  const canManageVault = org.myRole === "admin";
  const method = proposalPaymentMethod(proposal);
  const isOnchainVault = method === "onchain" && Boolean(proposal.onchainAddress && proposal.amountSats);
  const summary = paymentSummary(proposal);
  const feeLabel = platformFeeDisplay(method, proposal.amountSats, proposal.amountUsd);
  const myVote = auth ? proposal.votes.find((v) => v.author === auth.pubkey)?.choice ?? null : null;
  const yesPct = Math.min(100, (proposal.yesCount / Math.max(1, org.config?.threshold ?? 1)) * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="proposal-review-title"
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-xl border border-border bg-bg-panel shadow-2xl sm:rounded-xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-bg-panel px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={"text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border flex items-center gap-1 " + statusStyle[status]}>
                <StatusIcon className="h-3 w-3" /> {status}
              </span>
              {summary && <span className="text-[11px] font-mono text-primary">{summary}</span>}
            </div>
            <h2 id="proposal-review-title" className="mt-2 font-serif text-xl italic">{proposal.title}</h2>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Proposed by {shortNpub(proposal.author)} · {new Date(proposal.createdAt * 1000).toLocaleString()}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close proposal review"
            className="h-8 w-8 shrink-0 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-border-bright transition flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {proposal.body ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{proposal.body}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No description was provided.</p>
          )}

          {proposal.type === "payment" && (
            <div className="grid gap-3 sm:grid-cols-3">
              <ReviewStat label="Payment method" value={method ? paymentLabels[method] : "—"} />
              <ReviewStat
                label={method === "usdb" ? "Amount (USD)" : "Amount (sats)"}
                value={
                  method === "usdb"
                    ? proposal.amountUsd != null
                      ? Number(proposal.amountUsd).toLocaleString("en-US")
                      : "in invoice/address"
                    : proposal.amountSats != null
                      ? Number(proposal.amountSats).toLocaleString("en-US")
                      : "in invoice"
                }
              />
              <ReviewStat label="Recipient" value={proposal.payee ?? proposal.onchainAddress ?? "—"} mono />
            </div>
          )}

          {proposal.type === "config" && proposal.configChange && (
            <div className="rounded-md border border-primary/30 bg-primary-dim px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <Gavel className="h-4 w-4" /> Configuration change
              </div>
              <div className="mt-1 text-sm">{configChangeSummary(proposal.configChange)}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                When this passes with the current threshold of yes-votes, an administrator applies it with the org
                key. Threshold and signer changes derive a new vault address.
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <ReviewStat label="Yes votes" value={String(proposal.yesCount)} />
            <ReviewStat label="No votes" value={String(proposal.noCount)} />
            <ReviewStat label="Abstain" value={String(proposal.votes.length - proposal.yesCount - proposal.noCount)} />
          </div>
          <div>
            <div className="h-2 rounded-full bg-bg-elev-2 overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${yesPct}%` }} />
            </div>
            <div className="mt-1.5 text-[10px] font-mono text-muted-foreground-2">
              {proposal.yesCount}/{org.config?.threshold ?? "M"} member votes required
              {myVote && ` · your vote: ${myVote}`}
            </div>
          </div>

          {!proposal.executed && !proposal.passed && canPropose && (
            <VoteButtons proposal={proposal} voted={myVote} />
          )}
          {!canPropose && (
            <div className="rounded-md border border-border bg-bg-elev-1/50 px-4 py-3 text-sm text-muted-foreground">
              Read-only view. Join the organization to vote or move funds.
            </div>
          )}

          {proposal.passed && !proposal.executed && canPayDirectly(proposal, org.vaultComplete) && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--green)]/30 bg-[var(--green)]/10 px-4 py-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-[var(--green)]" /> Approved — the payment is submitted automatically.
                {feeLabel && (
                  <span className="text-xs text-muted-foreground">{feeLabel} charged automatically.</span>
                )}
                {org.myRole === "admin" && (
                  <span className="text-xs text-muted-foreground">Use the button if it did not go through.</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {org.myRole === "admin" && <MakePaymentButton proposal={proposal} />}
                <Link
                  to="/app/payments"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  Open payments <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          )}

          {proposal.passed && !proposal.executed && isOnchainVault && (
            <div className="space-y-3 rounded-md border border-[var(--green)]/30 bg-[var(--green)]/10 p-4">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-[var(--green)]" /> Approved — the vault spend is ready.
              </div>
              {canManageVault && <SpendActions proposal={proposal} />}
              <SignatureRoster key={`review-${proposal.id}-${proposal.psbtSigs}`} proposalId={proposal.id} />
            </div>
          )}

          {proposal.passed && !proposal.executed && proposal.type === "general" && (
            <div className="flex items-center gap-2 rounded-md border border-[var(--green)]/30 bg-[var(--green)]/10 px-4 py-3 text-sm">
              <CheckCircle2 className="h-4 w-4 text-[var(--green)]" /> Approved — no funds need to move.
            </div>
          )}

          {proposal.executed && proposal.type !== "config" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--blue)]/30 bg-[var(--blue)]/10 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-[var(--blue)]" />
                <div className="min-w-0">
                  <div>Payment recorded</div>
                  <div className="truncate font-mono text-[10px] text-muted-foreground">
                    {proposal.execution?.reference ?? proposal.execution?.txid ?? "reference unavailable"}
                  </div>
                </div>
              </div>
              {isOnchainVault && proposal.execution && (
                <a
                  href={`${explorerUiBase()}/tx/${proposal.execution.txid}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-mono text-primary hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" /> View transaction
                </a>
              )}
            </div>
          )}

          {proposal.executed && proposal.type === "config" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--blue)]/30 bg-[var(--blue)]/10 px-4 py-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-[var(--blue)]" /> Change applied
              </div>
              {proposal.configChange && (
                <span className="text-[11px] text-muted-foreground">{configChangeSummary(proposal.configChange)}</span>
              )}
            </div>
          )}

          <div className="border-t border-border pt-4">
            <button
              onClick={() => setSettings({ advancedMode: !advanced })}
              className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-bg-elev-2/40 px-4 py-3 text-sm transition hover:border-border-bright"
            >
              <span className="flex items-center gap-2 text-foreground">
                <Code2 className="h-4 w-4 text-primary" /> Advanced cryptographic details
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {advanced ? "Hide" : "Show"}
              </span>
            </button>

            {advanced && (
              <div className="mt-4 space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <ReviewStat label="Taproot vault" value={details?.vaultAddress ?? org.vault?.address ?? "incomplete"} mono />
                  <ReviewStat
                    label="Threshold"
                    value={details?.threshold ? `${details.threshold}-of-${org.config?.vaultSigners.length ?? "?"}` : "—"}
                  />
                  <ReviewStat label="Signature scheme" value="Taproot CHECKSIGADD" />
                </div>

                {loadingDetails || !details ? (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-bg-elev-2/30 px-4 py-3 text-xs text-muted-foreground">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading Nostr events from relays…
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground-2">
                        <Shield className="h-3 w-3" /> Signature roster
                      </div>
                      <p className="text-[11px] leading-relaxed text-muted-foreground-2">
                        Votes are signed Nostr events. Vault co-signatures are only needed when an
                        approved on-chain payout is being broadcast, so &ldquo;not signed&rdquo; is
                        expected while a proposal is only being voted on.
                      </p>
                      <SignatureDetails
                        signatures={details.signatures}
                        threshold={details.threshold}
                        onchainOnly={!isOnchainVault}
                      />
                    </div>
                    {details.proposalEvent && <JsonBlock title="Proposal event" events={[details.proposalEvent]} />}
                    <JsonBlock title="Vote events" events={details.voteEvents} />
                    <JsonBlock title="PSBT cosign events" events={details.cosignEvents} />
                    <JsonBlock title="Execution events" events={details.executionEvents} />
                    <JsonBlock title="Vault signer events" events={details.signerEvents} />
                    <button
                      onClick={() => void load()}
                      className="h-9 px-4 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:border-border-bright transition flex items-center gap-2"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Refresh from relays
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProposalsPage() {
  const org = useOrg();
  const auth = useAuth().signer;
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [reviewId, setReviewId] = useState<string | null>(null);

  const reviewProposal = org.proposals.find((p) => p.id === reviewId) ?? null;
  const canPropose = org.myRole === "admin" || org.myRole === "member";
  const canManageVault = org.myRole === "admin";
  const threshold = org.config?.threshold ?? 0;
  const needsMyVote = org.proposals.filter(
    (p) => !p.executed && !p.passed && !p.votes.some((v) => v.author === auth?.pubkey),
  ).length;

  const proposals = org.proposals.filter((p) => {
    if (filter === "open") return !p.passed && !p.executed;
    if (filter === "passed") return p.passed && !p.executed;
    if (filter === "executed") return p.executed;
    return true;
  });

  const myVote = (p: ProposalView): VoteChoice | null => {
    if (!auth) return null;
    const v = p.votes.find((v) => v.author === auth.pubkey);
    return v?.choice ?? null;
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif italic">Proposals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed via Nostr (kind 37000 + votes), settled by {threshold || "M"}-of-{org.config?.vaultSigners.length ?? "N"} taproot multisig.
          </p>
        </div>
        {canPropose && (
          <button
            onClick={() => setShowNew((s) => !s)}
            className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90 transition"
          >
            <Plus className="h-4 w-4" /> New proposal
          </button>
        )}
      </div>

      <OrgWalletNote org={org} compact />
      {!canPropose && !org.loading && (
        <div className="rounded-md border border-border bg-bg-elev-1/50 px-4 py-3 text-sm text-muted-foreground">
          Read-only view. Join the organization to submit proposals or vote.
        </div>
      )}
      {canPropose && needsMyVote > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary-dim/30 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <Vote className="h-4 w-4 text-primary" />
            <span>
              <strong className="text-primary">{needsMyVote}</strong> proposal{needsMyVote === 1 ? "" : "s"} waiting for your vote
            </span>
          </div>
          <button
            onClick={() => setFilter("open")}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
          >
            Show open proposals
          </button>
        </div>
      )}

      {showNew && canPropose && <NewProposal onDone={() => setShowNew(false)} />}

      <div className="flex items-center gap-2 flex-wrap">
        {(
          [
            ["all", "All"],
            ["open", "Voting"],
            ["passed", "Passed"],
            ["executed", "Executed"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={
              "h-8 px-3 rounded-md text-xs font-mono uppercase tracking-wider border transition " +
              (filter === key
                ? "bg-bg-elev-2 border-border-bright text-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-border-bright")
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-bg-elev-1/50 overflow-hidden">
        <div className="hidden md:grid grid-cols-12 px-5 py-3 border-b border-border text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-bg-elev-2/40">
          <div className="col-span-1">ID</div>
          <div className="col-span-5">Proposal</div>
          <div className="col-span-3">Votes</div>
          <div className="col-span-2">Quorum</div>
          <div className="col-span-1 text-right">Status</div>
        </div>
        <div className="divide-y divide-border">
          {proposals.length === 0 && (
            <div className="px-5 py-6 text-sm text-muted-foreground">
              {org.loading ? "Loading proposals from relays…" : "No proposals yet — create the first one."}
            </div>
          )}
          {proposals.map((p) => {
            const status = p.executed ? "executed" : p.passed ? "passed" : "voting";
            const Icon = statusIcon[status];
            const method = proposalPaymentMethod(p);
            const summary = paymentSummary(p);
            const isOnchainVault = method === "onchain" && Boolean(p.onchainAddress && p.amountSats);
            const changeSummary = p.type === "config" && p.configChange ? configChangeSummary(p.configChange) : null;
            const yesPct = Math.min(100, (p.yesCount / Math.max(1, threshold)) * 100);
            return (
              <div key={p.id} className="px-5 py-4 grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 items-center hover:bg-bg-elev-2/40 transition">
                <div className="md:col-span-1 font-mono text-[11px] text-muted-foreground-2">{p.id.slice(0, 8)}</div>
                <div className="md:col-span-5 min-w-0">
                  <button onClick={() => setReviewId(p.id)} className="text-left w-full group">
                    <div className="text-sm font-medium truncate group-hover:text-primary">{p.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      by {shortNpub(p.author)} · {new Date(p.createdAt * 1000).toLocaleDateString()}
                      {summary && <span className="text-primary"> · {summary}</span>}
                      {changeSummary && <span className="text-primary"> · {changeSummary}</span>}
                    </div>
                    {p.body && (
                      <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground-2">{p.body}</div>
                    )}
                  </button>
                </div>
                <div className="md:col-span-3 font-mono text-[11px] text-muted-foreground flex items-center gap-3">
                  <span className="text-[var(--green)]">{p.yesCount} yes</span>
                  <span className="text-destructive">{p.noCount} no</span>
                  <span>{p.votes.length - p.yesCount - p.noCount} abs</span>
                </div>
                <div className="md:col-span-2">
                  <div className="h-1.5 rounded-full bg-bg-elev-2 overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${yesPct}%` }} />
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground-2 mt-1">{p.yesCount}/{threshold} member votes</div>
                </div>
                <div className="md:col-span-1 flex md:justify-end">
                  <span className={"text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border flex items-center gap-1 " + statusStyle[status]}>
                    <Icon className="h-3 w-3" /> {status}
                  </span>
                </div>
                <div className="md:col-span-12 flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => setReviewId(p.id)}
                    className="h-9 px-3 rounded-md border border-border text-xs font-medium text-foreground hover:border-border-bright hover:text-primary transition flex items-center gap-2"
                  >
                    <Eye className="h-3.5 w-3.5" /> Review details
                  </button>
                  {!p.executed && canPropose && !p.passed && <VoteButtons proposal={p} voted={myVote(p)} />}
                  {p.passed && !p.executed && isOnchainVault && org.vaultComplete && (
                    <>
                      {canManageVault && <SpendActions proposal={p} />}
                      <SignatureRoster key={`${p.id}-${p.psbtSigs}`} proposalId={p.id} />
                    </>
                  )}
                  {p.passed && !p.executed && canPayDirectly(p, org.vaultComplete) && (
                    org.myRole === "admin" ? (
                      <MakePaymentButton proposal={p} />
                    ) : (
                      <Link
                        to="/app/payments"
                        className="h-9 px-3 rounded-md border border-[var(--green)]/30 text-xs font-medium text-[var(--green)] hover:opacity-90 transition flex items-center gap-2"
                      >
                        Payment approved <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    )
                  )}
                  {p.passed && !p.executed && p.type === "config" && (
                    org.myRole === "admin" && canExecuteConfigChange(p) ? (
                      <ApplyConfigButton proposal={p} />
                    ) : (
                      <span className="text-[10px] font-mono text-muted-foreground-2 flex items-center gap-1">
                        <Gavel className="h-3 w-3" /> passed — awaiting application
                      </span>
                    )
                  )}
                  {p.passed && !p.executed && p.type === "general" && (
                    <span className="text-[10px] font-mono text-muted-foreground-2 flex items-center gap-1">
                      <Gavel className="h-3 w-3" /> passed — no payment required
                    </span>
                  )}
                  {p.passed && !p.executed && p.type === "payment" && !isOnchainVault && !method && (
                    <span className="text-[10px] font-mono text-muted-foreground-2 flex items-center gap-1">
                      <Gavel className="h-3 w-3" /> passed — awaiting execution
                    </span>
                  )}
                  {p.executed && p.execution && (
                    <>
                      <span className="font-mono text-[10px] text-muted-foreground-2">
                        paid · {(p.execution.reference ?? p.execution.txid).slice(0, 16)}…
                      </span>
                      {isOnchainVault && (
                        <a
                          href={`${explorerUiBase()}/tx/${p.execution.txid}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-mono text-primary hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" /> View transaction
                        </a>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {reviewProposal && (
        <ProposalReviewDialog proposal={reviewProposal} onClose={() => setReviewId(null)} />
      )}
    </div>
  );
}
