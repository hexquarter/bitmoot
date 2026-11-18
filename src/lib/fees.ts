import type { BreezSdk } from "@breeztech/breez-sdk-spark/web";
import type { PaymentMethod } from "./org";
import { payOrgLightningInvoice, sendUsdb, withdrawOnchain } from "./spark";

/** Platform fee charged on every approved payment. Not configurable by orgs. */
export const PLATFORM_FEE_RATE = 0.01;

/** The fee destination comes from the platform deployment, never from org settings. */
export function platformFeeAddress(): string | null {
  return import.meta.env.VITE_PLATFORM_FEE_ADDRESS?.trim() || null;
}

export function platformFeeSats(amountSats: number): number {
  return Math.max(1, Math.round(amountSats * PLATFORM_FEE_RATE));
}

export function platformFeeUsdb(amountUsd: number): number {
  return Math.max(0.01, Math.round(amountUsd * PLATFORM_FEE_RATE * 100) / 100);
}

export function platformFeeDisplay(
  method: PaymentMethod | null,
  amountSats?: number | null,
  amountUsd?: number | null,
): string | null {
  if (!platformFeeAddress()) return null;
  if (method === "usdb") {
    return amountUsd != null ? `${platformFeeUsdb(amountUsd).toFixed(2)} USDB fee` : null;
  }
  return amountSats != null ? `${platformFeeSats(amountSats).toLocaleString("en-US")} sats fee` : null;
}

/**
 * Charge the platform fee from the same shared org wallet that made the
 * payment. A USDB fee needs a Spark destination; sats fees accept a Lightning
 * address or an on-chain address.
 */
export async function payPlatformFee(
  wallet: BreezSdk,
  method: PaymentMethod,
  amountSats?: number | null,
  amountUsd?: number | null,
): Promise<string | null> {
  const address = platformFeeAddress();
  if (!address) return null;

  if (method === "usdb") {
    if (!address.startsWith("sp") || amountUsd == null) {
      throw new Error("USDB payments need a Spark platform fee address");
    }
    return sendUsdb(wallet, address, platformFeeUsdb(amountUsd));
  }

  if (amountSats == null) throw new Error("Fee amount could not be determined");
  const feeSats = platformFeeSats(amountSats);
  if (address.startsWith("bc1")) {
    return withdrawOnchain(wallet, address, feeSats);
  }
  // A BOLT-11 invoice commits to its own amount; a Lightning address needs
  // the computed fee passed in.
  const result = await payOrgLightningInvoice(
    wallet,
    address,
    undefined,
    address.startsWith("ln") ? undefined : feeSats,
  );
  return result.id;
}
