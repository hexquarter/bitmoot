import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowUpRight, ArrowDownRight, Copy, ExternalLink, Shield, Zap, Lock, Unlock, RefreshCw, Vault, Flame, Send,
} from "lucide-react";
import { useOrg, unlockTreasury, treasurySeed, sweepExcessToVault, updateTreasuryPolicy, advanceVaultMigration, proposeConfigChange, rotateWalletSeed, shortNpub, orgWalletSeed } from "../../lib/org";
import {
  connectOrgWallet, getOrgBalances, getOrgStaticDepositAddress, getOrgTransfers,
  getOrgLightningAddress, registerOrgLightningAddress, suggestLightningUsername, formatUsdb,
  type OrgBalances, type OrgTransfer, type OrgLightningAddress,
} from "../../lib/spark";
import { fetchAddressBalance, fetchUtxos, explorerUiBase } from "../../lib/vault";
import { OrgWalletNote } from "../../components/OrgWalletNote";

function fmtSats(n: bigint): string {
  return Number(n).toLocaleString("en-US");
}

function copy(text: string) {
  navigator.clipboard?.writeText(text);
  toast.success("Copied to clipboard");
}

export function TreasuryPage() {
  const org = useOrg();
  const canManage = org.myRole === "admin";
  const [balances, setBalances] = useState<OrgBalances | null>(null);
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [lightningAddr, setLightningAddr] = useState<OrgLightningAddress | null>(null);
  const [lnUsername, setLnUsername] = useState("");
  const [transfers, setTransfers] = useState<OrgTransfer[]>([]);
  const [vaultBalance, setVaultBalance] = useState<bigint | null>(null);
  const [utxoCount, setUtxoCount] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [capInput, setCapInput] = useState("");
  const [showReceive, setShowReceive] = useState(false);
  const [thresholdInput, setThresholdInput] = useState("");
  const [confirmRotate, setConfirmRotate] = useState(false);

  const hotCap = org.config?.hotCapSats;

  useEffect(() => {
    setCapInput(hotCap != null ? String(hotCap) : "");
  }, [hotCap]);

  const currentThreshold = org.config?.threshold;
  useEffect(() => {
    setThresholdInput(currentThreshold != null ? String(currentThreshold) : "");
  }, [currentThreshold]);

  const proposeThreshold = async () => {
    if (!canManage) return;
    const value = Number(thresholdInput.replace(/[,\s]/g, ""));
    setBusy("threshold");
    try {
      await proposeConfigChange(
        { action: "setThreshold", threshold: Number.isFinite(value) ? value : 0 },
        `Change vault threshold to ${Number.isFinite(value) ? value : 0}`,
      );
      toast.success("Threshold proposal published — applies automatically when it passes");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const refresh = useCallback(async () => {
    if (!canManage || !orgWalletSeed()) return;
    setBusy("refresh");
    try {
      const wallet = await connectOrgWallet(org.orgPubkey!, orgWalletSeed()!);
      const [b, deposit, lnAddr, txs] = await Promise.all([
        getOrgBalances(wallet),
        getOrgStaticDepositAddress(wallet),
        getOrgLightningAddress(wallet).catch(() => null),
        getOrgTransfers(wallet).catch(() => []),
      ]);
      setBalances(b);
      setDepositAddress(deposit);
      setLightningAddr(lnAddr);
      setLnUsername((current) => current || suggestLightningUsername(org.config?.name ?? ""));
      setTransfers(txs);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [canManage, org.config?.name]);

  useEffect(() => {
    // Deferred to a microtask: state updates land outside the effect commit.
    if (org.seedUnlocked) void Promise.resolve().then(refresh);
  }, [org.seedUnlocked, refresh]);

  const vaultAddress = org.vault?.address;
  useEffect(() => {
    if (!vaultAddress) return;
    fetchAddressBalance(vaultAddress)
      .then(setVaultBalance)
      .catch(() => setVaultBalance(null));
    fetchUtxos(vaultAddress)
      .then((u) => setUtxoCount(u.length))
      .catch(() => setUtxoCount(0));
  }, [vaultAddress]);

  const unlock = async () => {
    if (!canManage) return;
    setBusy("unlock");
    try {
      await unlockTreasury();
      toast.success("Treasury unlocked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const saveCap = async () => {
    if (!canManage) return;
    const value = Number(capInput.replace(/[,\s]/g, ""));
    setBusy("cap");
    try {
      await updateTreasuryPolicy(Number.isFinite(value) ? value : 0);
      toast.success(hotCap != null ? "Operational cap updated" : "Operational cap set");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const sweep = async () => {
    if (!canManage) return;
    setBusy("sweep");
    try {
      const result = await sweepExcessToVault();
      if (result) {
        toast.success(`Swept ${fmtSats(BigInt(result.sweptSats))} sats to the reserve vault`);
        await refresh();
      } else {
        toast.info("Nothing to sweep — the hot wallet is within its cap");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const registerLnAddress = async () => {
    if (!canManage || !orgWalletSeed()) return toast.error("Unlock the treasury first");
    setBusy("lnaddr");
    try {
      const wallet = await connectOrgWallet(org.orgPubkey!, orgWalletSeed()!);
      const registered = await registerOrgLightningAddress(wallet, lnUsername);
      setLightningAddr(registered);
      toast.success(`Lightning address registered: ${registered.address}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const rotate = async () => {
    if (!canManage || !orgWalletSeed()) return toast.error("Unlock the treasury first");
    setBusy("rotate");
    try {
      const result = await rotateWalletSeed();
      toast.success("Wallet seed rotated — org identity and history unchanged");
      if (result.sweepErrors.length) {
        toast.error(`Old wallet evacuation incomplete: ${result.sweepErrors.join(" · ")}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setConfirmRotate(false);
    }
  };

  const total = (balances?.sats ?? 0n) + (vaultBalance ?? 0n);
  const excess = balances && hotCap != null ? balances.sats - BigInt(hotCap) : 0n;

  const retiredVaults = org.config?.retiredVaults ?? [];
  const retiredKey = retiredVaults.map((r) => r.address).join(",");
  const [retiredBalances, setRetiredBalances] = useState<Record<string, bigint | null>>({});
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      const out: Record<string, bigint | null> = {};
      for (const address of retiredKey ? retiredKey.split(",") : []) {
        try {
          out[address] = await fetchAddressBalance(address);
        } catch {
          out[address] = null;
        }
      }
      if (active) setRetiredBalances(out);
    });
    return () => {
      active = false;
    };
  }, [retiredKey]);

  const sweepRetired = async (address: string) => {    if (!canManage) return;
    setBusy(`retired:${address}`);
    try {
      const message = await advanceVaultMigration(address);
      toast.success(message);
      // Re-check balances after a possible broadcast
      try {
        setRetiredBalances((current) => ({ ...current, [address]: null }));
        const fresh = await fetchAddressBalance(address);
        setRetiredBalances((current) => ({ ...current, [address]: fresh }));
      } catch {
        /* keep previous */
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif italic">Treasury</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Two pools: an operational Spark wallet for frequent payments, and an {" "}
            {org.config?.threshold ?? "M"}-of-{org.config?.vaultSigners.length ?? "N"} taproot reserve for storage.
          </p>
        </div>
        {canManage ? (
          org.seedUnlocked ? (
            <button
              onClick={refresh}
              disabled={busy === "refresh"}
              className="h-10 px-4 rounded-md border border-border bg-bg-elev-2/50 text-sm flex items-center gap-2 hover:border-border-bright transition"
            >
              <RefreshCw className={"h-4 w-4 " + (busy === "refresh" ? "animate-spin" : "")} /> Refresh
            </button>
          ) : (
            <button
              onClick={unlock}
              disabled={busy === "unlock"}
              className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90 transition"
            >
              <Unlock className="h-4 w-4" /> {busy === "unlock" ? "Decrypting…" : "Unlock treasury"}
            </button>
          )
        ) : (
          <span className="rounded-md border border-border bg-bg-elev-2/50 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Read only
          </span>
        )}
      </div>

      <OrgWalletNote org={org} />

      {!canManage && (
        <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5 text-sm text-muted-foreground flex items-start gap-3">
          <Lock className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <div>
            Members see the shared wallet and vault publicly. Only administrators unlock the Breez wallet to view
            live balances and transfers. To move funds, submit a proposal instead.
          </div>
        </div>
      )}

      {canManage && !org.seedUnlocked && (
        <div className="rounded-lg border border-border bg-bg-elev-1/50 p-5 text-sm text-muted-foreground flex items-start gap-3">
          <Lock className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <div>
            The treasury is locked. Unlocking decrypts your NIP-44 wallet share (kind 30079) from your relays and
            connects the org Spark wallet locally. The seed stays in memory only.
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          Total treasury · {canManage && org.seedUnlocked ? `₿ ${(Number(total) / 1e8).toFixed(4)}` : "admins only"}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* ---------------------------------------------------------------
            Operational pool — hot Spark wallet for frequent payments.
            Its control is single-key, so its holdings are capped.
        ---------------------------------------------------------------- */}
        <div className="rounded-lg border border-border bg-gradient-to-br from-bg-elev-1 to-bg-elev-2/30 p-6 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                <Zap className="h-3.5 w-3.5 text-[var(--yellow)]" /> Operational wallet · Spark
              </div>
              <span className="rounded border border-[var(--yellow)]/40 bg-[var(--yellow)]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--yellow)]">
                hot · instant
              </span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              For frequent payments: Lightning, Spark transfers and USDB. Instant — but any single admin key
              can spend it, so it should only ever hold the operational cap.
            </p>
            <div className="text-4xl font-mono font-semibold tracking-tight">
              {canManage ? (org.seedUnlocked ? `₿ ${(Number(balances?.sats ?? 0n) / 1e8).toFixed(4)}` : "locked") : "—"}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              {balances ? `${fmtSats(balances.sats)} sats · ${formatUsdb(balances.usdb)} USDB` : "unlock to see balances"}
            </div>

            {canManage && (
              <div className="rounded-md border border-border bg-bg-elev-2/50 p-3 space-y-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground-2">
                  Operational cap
                </div>
                {org.seedUnlocked ? (
                  <div className="flex gap-2">
                    <input
                      value={capInput}
                      onChange={(e) => setCapInput(e.target.value)}
                      placeholder="e.g. 50000 sats kept spendable"
                      inputMode="numeric"
                      className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 font-mono text-xs focus:outline-none focus:border-primary/60"
                    />
                    <button
                      onClick={saveCap}
                      disabled={busy === "cap"}
                      className="h-9 shrink-0 px-3 rounded-md border border-border text-xs text-primary hover:border-border-bright transition disabled:opacity-50"
                    >
                      {busy === "cap" ? "Saving…" : "Save cap"}
                    </button>
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground">
                    {hotCap != null ? `${fmtSats(BigInt(hotCap))} sats cap · unlock to change` : "no cap set · unlock to configure"}
                  </div>
                )}
                <p className="text-[10px] leading-relaxed text-muted-foreground-2">
                  Hot payments above this cap are refused and must settle through the reserve vault with a
                  passed on-chain proposal{hotCap == null ? " — no cap is set yet" : ""}.
                </p>
                {excess > 0n && (
                  <button
                    onClick={sweep}
                    disabled={busy === "sweep" || !org.vaultComplete}
                    title={!org.vaultComplete ? "Reserve vault is not ready yet" : undefined}
                    className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium flex items-center gap-2 hover:opacity-90 transition disabled:opacity-50"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    {busy === "sweep" ? "Sweeping…" : `Sweep ${fmtSats(excess)} sats to reserve`}
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowReceive((v) => !v)}
                className="h-9 px-3 rounded-md border border-border bg-bg-elev-2/50 text-xs flex items-center gap-2 hover:border-border-bright transition"
              >
                <ArrowDownRight className="h-3.5 w-3.5" /> {showReceive ? "Hide addresses" : "Receive"}
              </button>
              <Link
                to="/app/payments"
                title="Send a payment from the operational wallet"
                className="h-9 px-3 rounded-md border border-border bg-bg-elev-2/50 text-xs flex items-center gap-2 hover:border-border-bright transition"
              >
                <Zap className="h-3.5 w-3.5 text-[var(--yellow)]" /> Pay
              </Link>
            </div>

            {showReceive && (
              <div className="rounded-md border border-border bg-bg-elev-2/50 p-3 space-y-3">
                {org.seedUnlocked ? (
                  <>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground-2">
                        Static deposit (L1 → Spark)
                      </div>
                      <div className="mt-1 font-mono text-[11px] break-all">{depositAddress ?? "—"}</div>
                      {depositAddress && (
                        <button onClick={() => copy(depositAddress)} className="mt-1 text-[11px] text-primary hover:underline flex items-center gap-1">
                          <Copy className="h-3 w-3" /> Copy
                        </button>
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground-2">
                        Lightning address (works with any Lightning wallet)
                      </div>
                      {lightningAddr ? (
                        <>
                          <div className="mt-1 font-mono text-[11px] break-all">{lightningAddr.address}</div>
                          <button onClick={() => copy(lightningAddr.address)} className="mt-1 text-[11px] text-primary hover:underline flex items-center gap-1">
                            <Copy className="h-3 w-3" /> Copy
                          </button>
                        </>
                      ) : (
                        <div className="mt-1.5 flex gap-2">
                          <input
                            value={lnUsername}
                            onChange={(e) => setLnUsername(e.target.value)}
                            placeholder="choose-a-name"
                            className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 font-mono text-xs focus:outline-none focus:border-primary/60"
                          />
                          <button
                            onClick={registerLnAddress}
                            disabled={busy === "lnaddr" || !lnUsername.trim()}
                            className="h-9 shrink-0 px-3 rounded-md border border-border text-xs text-primary hover:border-border-bright transition disabled:opacity-50"
                          >
                            {busy === "lnaddr" ? "Registering…" : "Register"}
                          </button>
                        </div>
                      )}
                      <p className="mt-1 text-[10px] text-muted-foreground-2">
                        {lightningAddr
                          ? "Any Lightning-compatible wallet can pay this address (LUD-16)."
                          : "name@domain identifier — more interoperable than a raw Spark address."}
                      </p>
                    </div>
                    <p className="text-[10px] text-muted-foreground-2">
                      Deposits here land in the operational wallet. To fund the reserve vault instead, use its
                      address in the vault card.
                    </p>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Lock className="h-3.5 w-3.5 shrink-0" /> Unlock the treasury to reveal the receive addresses.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ---------------------------------------------------------------
            Reserve pool — cold L1 multisig for storage. No single admin
            can withdraw: every spend needs a passed proposal + M-of-N sigs.
        ---------------------------------------------------------------- */}
        <div className="rounded-lg border border-[var(--green)]/25 bg-[var(--green)]/[0.03] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <Vault className="h-3.5 w-3.5 text-[var(--green)]" /> Reserve vault · L1 multisig
            </div>
            <span className="rounded border border-[var(--green)]/40 bg-[var(--green)]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--green)]">
              cold · storage
            </span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            For long-term storage. <strong className="text-foreground">No single admin can withdraw anything</strong> —
            every vault payment needs a passed proposal and {org.config?.threshold ?? "M"}-of-{org.config?.vaultSigners.length ?? "N"} co-signatures.
          </p>
          <div className="text-4xl font-mono font-semibold tracking-tight">
            {vaultBalance !== null ? `₿ ${(Number(vaultBalance) / 1e8).toFixed(4)}` : "—"}
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            {vaultBalance !== null ? `${fmtSats(vaultBalance)} sats · ${utxoCount} UTXO${utxoCount === 1 ? "" : "s"}` : "vault incomplete"}
          </div>
          <div className="font-mono text-[12px] space-y-2 border-t border-border pt-3">
            <div className="flex justify-between"><span className="text-muted-foreground">Script</span><span>Taproot {org.config?.threshold ?? "–"}-of-{org.config?.vaultSigners.length ?? "–"}</span></div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-muted-foreground shrink-0">Address</span>
              <code className="font-mono text-[11px] truncate">{org.vault?.address ?? "vault incomplete"}</code>
            </div>
          </div>
          {canManage && org.vaultComplete && (
            <div className="rounded-md border border-border bg-bg-elev-2/50 p-3 space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground-2">
                Change threshold
              </div>
              <div className="flex gap-2">
                <input
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value)}
                  inputMode="numeric"
                  className="h-9 min-w-0 w-24 rounded-md border border-border bg-background px-3 font-mono text-xs focus:outline-none focus:border-primary/60"
                />
                <button
                  onClick={proposeThreshold}
                  disabled={busy === "threshold"}
                  className="h-9 shrink-0 px-3 rounded-md border border-border text-xs text-primary hover:border-border-bright transition disabled:opacity-50"
                >
                  {busy === "threshold" ? "Proposing…" : "Propose change"}
                </button>
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground-2">
                Creates a voted proposal; it applies automatically when it gathers the current threshold of
                yes-votes. Changing the threshold (or the signer set) derives a new vault address — any funds left
                on the old one become sweepable below.
              </p>
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            {org.vault && (
              <>
                <button onClick={() => copy(org.vault!.address)} className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Copy className="h-3.5 w-3.5" /> Copy address
                </button>
                <button onClick={() => window.open(explorerUiBase() + "/address/" + org.vault!.address, "_blank")} className="text-xs text-muted-foreground hover:text-primary transition flex items-center gap-1">
                  <ExternalLink className="h-3.5 w-3.5" /> Explorer
                </button>
              </>
            )}
            <Link
              to="/app/proposals"
              title="Vault withdrawals start as an on-chain payment proposal; admins co-sign the PSBT"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Send className="h-3.5 w-3.5" /> Withdraw via proposal
            </Link>
          </div>
          {!org.vaultComplete && (
            <div className="text-[11px] text-[var(--yellow)] font-mono flex items-start gap-2">
              <Flame className="h-3.5 w-3.5 shrink-0 mt-px" />
              VAULT INCOMPLETE — waiting for member signer keys; deposits to this address are not withdrawable yet.
            </div>
          )}
        </div>
      </div>

      {retiredVaults.length > 0 && (
        <div className="rounded-lg border border-[var(--yellow)]/30 bg-[var(--yellow)]/[0.04] p-5 space-y-3">
          <div className="flex items-center gap-2 font-medium text-sm">
            <Flame className="h-4 w-4 text-[var(--yellow)]" />
            Retired vault address{retiredVaults.length === 1 ? "" : "es"} — move remaining funds
          </div>
          <p className="text-xs text-muted-foreground">
            The signer set changed, so these addresses no longer match the current vault. Their funds are still
            locked under the old threshold and can be swept into the current vault — every sweep needs the old
            threshold of co-signatures and can only pay the current vault address.
          </p>
          {retiredVaults.map((retired) => {
            const balance = retiredBalances[retired.address];
            const empty = balance === 0n;
            return (
              <div
                key={retired.address}
                className="rounded-md border border-border bg-bg-elev-2/50 p-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-mono text-[11px] break-all">{retired.address}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {retired.threshold}-of-{retired.signers.length} ·{" "}
                    {balance === undefined || balance === null
                      ? "balance unknown"
                      : empty
                        ? "no funds left"
                        : `${fmtSats(balance)} sats`}
                  </div>
                </div>
                {canManage && org.vaultComplete && !empty && (
                  <button
                    onClick={() => sweepRetired(retired.address)}
                    disabled={busy === `retired:${retired.address}`}
                    className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium flex items-center gap-2 hover:opacity-90 transition disabled:opacity-50"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    {busy === `retired:${retired.address}` ? "Working…" : "Sweep to current vault"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canManage && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/[0.04] p-5 space-y-3">
          <div className="flex items-center gap-2 font-medium text-sm">
            <Flame className="h-4 w-4 text-destructive" /> Rotate the wallet seed
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            If a seed share was leaked or compromised: rotation generates a brand-new Spark wallet seed, re-publishes
            every admin's encrypted share with it, and evacuates the operational wallet into the new one. The org
            identity, npub, proposals and feed history are untouched — only the wallet key changes, so old shares
            stop controlling anything of value. The L1 reserve vault is unaffected either way.
          </p>
          {!confirmRotate ? (
            <button
              onClick={() => setConfirmRotate(true)}
              disabled={busy !== null}
              className="h-10 px-4 rounded-md border border-destructive/40 text-sm font-medium text-destructive flex items-center gap-2 hover:bg-destructive/10 transition disabled:opacity-50"
            >
              <Flame className="h-4 w-4" /> Rotate wallet seed…
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={rotate}
                disabled={busy === "rotate"}
                className="h-10 px-4 rounded-md bg-destructive text-white text-sm font-medium flex items-center gap-2 hover:opacity-90 transition disabled:opacity-50"
              >
                <Flame className="h-4 w-4" />
                {busy === "rotate" ? "Rotating…" : "Confirm — new wallet seed & evacuation"}
              </button>
              <button
                onClick={() => setConfirmRotate(false)}
                disabled={busy === "rotate"}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <span className="text-[11px] text-[var(--yellow)]">
                Every admin receives a fresh share; the old wallet is emptied.
              </span>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border bg-bg-elev-1/50">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="font-medium">Operational wallet activity</div>
          <div className="text-[11px] font-mono text-muted-foreground">recent Spark transfers</div>
        </div>
        <div className="divide-y divide-border">
          {transfers.length === 0 && (
            <div className="px-5 py-6 text-sm text-muted-foreground">
              {!canManage
                ? "Transfers are visible to administrators."
                : org.seedUnlocked
                  ? "No transfers yet."
                  : "Unlock the treasury to see transfers."}
            </div>
          )}
          {transfers.slice(0, 15).map((t) => {
            const isOut = t.direction === "OUTGOING";
            return (
              <div key={t.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-bg-elev-2/40 transition">
                <div className={"h-8 w-8 rounded-full flex items-center justify-center " + (isOut ? "bg-primary/15 text-primary" : "bg-[var(--green)]/15 text-[var(--green)]")}>
                  {isOut ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t.type}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {t.status} · {t.createdAt ? new Date(t.createdAt * 1000).toLocaleString() : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono font-medium">{t.amount > 0n ? `${fmtSats(t.amount)} sats` : "—"}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
