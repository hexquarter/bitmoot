import { useEffect } from "react";
import { toast } from "sonner";
import {
  approvedPaymentProposals,
  canExecuteConfigChange,
  cosignVaultSpend,
  createVaultSpend,
  executeConfigChange,
  executeVaultSpend,
  exceedsOperationalCap,
  getActiveOrgPubkey,
  isOrgAdmin,
  listVaultSignatures,
  myVaultXOnly,
  orgWalletSeed,
  paymentMatchesProposal,
  proposalPaymentMethod,
  recordPaymentExecution,
  requireApprovedPayment,
  unlockTreasury,
  useOrg,
  type ProposalView,
} from "./org";
import { payPlatformFee } from "./fees";
import { Kind, query } from "./nostr";
import {
  connectOrgWallet,
  payOrgLightningInvoice,
  sendUsdb,
  withdrawOnchain,
} from "./spark";

/**
 * Approved payments are submitted once, on the device that sees the proposal
 * pass. These guards prevent a React re-render (or another tab in the same
 * session) from paying the same proposal twice. Other devices are protected by
 * the execution-event check below.
 */
const attempted = new Set<string>();
const inFlight = new Set<string>();

function claim(key: string): boolean {
  if (attempted.has(key) || inFlight.has(key)) return false;
  inFlight.add(key);
  return true;
}

function release(key: string) {
  inFlight.delete(key);
  attempted.add(key);
}

/** Vault spends need an m-of-n PSBT, so they are not paid from the Breez wallet. */
export function isVaultSpendProposal(proposal: ProposalView, vaultComplete: boolean): boolean {
  return (
    proposalPaymentMethod(proposal) === "onchain" &&
    Boolean(proposal.onchainAddress && proposal.amountSats) &&
    vaultComplete
  );
}

/** Can this proposal be paid directly from the shared org wallet? */
export function canPayDirectly(proposal: ProposalView, vaultComplete: boolean): boolean {
  if (proposal.type !== "payment" || !proposal.passed || proposal.executed) return false;
  const method = proposalPaymentMethod(proposal);
  if (!method) return false;
  if (isVaultSpendProposal(proposal, vaultComplete)) return false;
  const recipient = (proposal.payee ?? proposal.onchainAddress)?.trim();
  if (!recipient) return false;
  if (method !== "lightning" && proposal.amountSats == null && proposal.amountUsd == null) {
    return false;
  }
  return true;
}

async function assertNotExecuted(proposalId: string): Promise<void> {
  const events = await query({ kinds: [Kind.Execution], "#e": [proposalId], limit: 1 });
  if (events.length) throw new Error("This proposal has already been paid");
}

/**
 * Submit an approved payment from the shared org wallet and record the
 * execution event. Used by the automatic submission hook and by the manual
 * “Make the payment” buttons when automatic submission fails.
 */
export async function executeApprovedPayment(
  proposal: ProposalView,
  vaultComplete = false,
): Promise<string> {
  if (!isOrgAdmin()) throw new Error("Only organization administrators can make payments");
  if (!proposal.passed || proposal.executed || proposal.type !== "payment") {
    throw new Error("This payment is not approved and waiting");
  }

  const method = proposalPaymentMethod(proposal);
  if (!method || isVaultSpendProposal(proposal, vaultComplete)) {
    throw new Error("This payment must be settled with the multisig vault");
  }
  const recipient = (proposal.payee ?? proposal.onchainAddress ?? "").trim();
  const amount = method === "usdb" ? proposal.amountUsd : proposal.amountSats;
  if (!recipient) throw new Error("The approved proposal has no recipient");
  if (method !== "lightning" && amount == null) {
    throw new Error("The approved proposal has no amount");
  }
  if (!paymentMatchesProposal(proposal, { recipient, amount })) {
    throw new Error("The approved payment details do not match");
  }
  const authorized = requireApprovedPayment(method, recipient, amount);
  if (authorized.id !== proposal.id) {
    throw new Error("This payment is covered by a different approved proposal");
  }
  // Hot-wallet cap: large payments must settle through the reserve vault.
  if (exceedsOperationalCap(proposal.amountSats ?? null)) {
    throw new Error(
      "This payment is above the operational cap — settle it through the reserve vault (create an on-chain proposal)",
    );
  }

  await assertNotExecuted(proposal.id);
  if (!orgWalletSeed()) await unlockTreasury();
  const wallet = await connectOrgWallet(getActiveOrgPubkey()!, orgWalletSeed()!);

  let reference: string;
  let feeAmountSats = proposal.amountSats ?? null;
  if (method === "lightning") {
    const paid = await payOrgLightningInvoice(
      wallet,
      recipient,
      undefined,
      proposal.amountSats ?? undefined,
    );
    reference = paid.id;
    feeAmountSats = paid.amountSats ?? feeAmountSats;
  } else if (method === "usdb") {
    reference = await sendUsdb(wallet, recipient, Number(amount));
  } else {
    reference = await withdrawOnchain(wallet, recipient, Number(amount));
  }

  // The payment itself already succeeded, so record it even if the fee fails.
  let feeError: unknown;
  try {
    await payPlatformFee(wallet, method, feeAmountSats, proposal.amountUsd ?? null);
  } catch (error) {
    feeError = error;
  }
  await recordPaymentExecution(proposal, reference);
  if (feeError) {
    toast.error(
      `Payment sent, but the platform fee failed: ${feeError instanceof Error ? feeError.message : String(feeError)}`,
    );
  }
  return reference;
}

async function autoSubmitVaultSpend(
  proposal: ProposalView,
  threshold: number,
): Promise<string | null> {
  if (proposal.psbtSigs === 0) {
    await createVaultSpend(proposal);
    return "Vault spend prepared and signed for co-signing";
  }

  const [signatures, myXOnly] = await Promise.all([
    listVaultSignatures(proposal.id),
    myVaultXOnly(),
  ]);
  const mineSigned = signatures.some((s) => s.signerXOnly === myXOnly && s.signed);
  if (!mineSigned && proposal.psbtSigs < threshold) {
    await cosignVaultSpend(proposal);
    return "Vault co-signature published";
  }

  if (proposal.psbtSigs < threshold) return null;
  await assertNotExecuted(proposal.id);
  const txid = await executeVaultSpend(proposal);
  return `Vault payment broadcast · ${txid.slice(0, 16)}…`;
}

/**
 * Mounted in the app shell so an approved payment is submitted as soon as the
 * passing vote arrives, regardless of which page is open.
 */
export function useAutoSubmitPayments(): void {
  const org = useOrg();

  useEffect(() => {
    if (org.loading || !org.config || org.myRole !== "admin") return;
    const threshold = org.config.threshold;

    void Promise.resolve().then(async () => {
      for (const proposal of approvedPaymentProposals()) {
        const vaultSpend = isVaultSpendProposal(proposal, org.vaultComplete);
        // Vault spends advance through stages as co-signatures arrive, so each
        // signature count gets its own one-shot attempt.
        const key = vaultSpend
          ? `${proposal.id}:vault:${proposal.psbtSigs}`
          : `${proposal.id}:direct`;
        if (!claim(key)) continue;

        try {
          if (vaultSpend) {
            const message = await autoSubmitVaultSpend(proposal, threshold);
            if (message) toast.success(message);
          } else if (canPayDirectly(proposal, org.vaultComplete)) {
            const reference = await executeApprovedPayment(proposal, org.vaultComplete);
            toast.success(`Payment submitted automatically · ${reference.slice(0, 16)}…`);
          }
        } catch (error) {
          // Manual “Make the payment” controls stay available on failure.
          console.warn("[bitmoot] automatic payment submission failed:", error);
        } finally {
          release(key);
        }
      }

      // Passed config proposals (threshold / signer / member changes) apply
      // automatically too. Needs an unlocked treasury; if locked, the manual
      // "Apply change" control on the proposal stays available.
      for (const proposal of org.proposals) {
        if (!canExecuteConfigChange(proposal)) continue;
        const key = `${proposal.id}:config`;
        if (!claim(key)) continue;
        try {
          const summary = await executeConfigChange(proposal);
          toast.success(`Config change applied · ${summary}`);
        } catch (error) {
          console.warn("[bitmoot] automatic config change execution failed:", error);
        } finally {
          release(key);
        }
      }
    });
  }, [org.loading, org.config, org.myRole, org.proposals, org.vaultComplete]);
}
