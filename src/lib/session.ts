import { signOut } from "./auth";
import { lockTreasury } from "./org";
import { setSettings } from "./settings";

/** End the local session completely: forget the org scope and any wallet seed. */
export function logOut() {
  lockTreasury();
  setSettings({ activeOrgNpub: undefined });
  signOut();
}
