import { Bell, ChevronDown, LayoutDashboard, Plus, Radio, Search, Send, Settings, Users, Vote, Wallet, LogOut, Lock } from "lucide-react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth, signOut } from "../lib/auth";
import { useOrg, shortNpub, lockTreasury } from "../lib/org";
import { useSettings } from "../lib/settings";

const nav = [
  ["/app", "Dashboard", LayoutDashboard, "", true],
  ["/app/proposals", "Proposals", Vote, "", false],
  ["/app/treasury", "Treasury", Wallet, "", false],
  ["/app/members", "Members", Users, "", false],
  ["/app/payments", "Payments", Send, "", false],
  ["/app/feed", "Nostr feed", Radio, "", false],
  ["/app/settings", "Settings", Settings, "", false],
] as const;

export const AppPage = () => {
  const { pathname } = useLocation();
  const { signer } = useAuth();
  const org = useOrg();
  const settings = useSettings();

  if (!signer) return <Navigate to="/auth" replace />;

  const orgName = org.config?.name ?? (org.loading ? "Loading org…" : "No org selected");
  const orgMark = orgName.slice(0, 2).toUpperCase();
  const proposalCount = org.proposals.filter((p) => !p.executed).length;

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand"><Link to="/">BIT<span>MOOT</span><b>.</b></Link><small>{org.config?.name?.toUpperCase() ?? "PLEBS LABEL"} / {settings.network}</small></div>
        <Link className="org-switcher" to="/app/settings" aria-label="Switch organization"><span className="org-mark">{orgMark}</span><span><strong>{orgName}</strong><small>{org.orgNpub ? shortNpub(org.orgNpub) : "settings → pick an org"}</small></span><ChevronDown size={14} /></Link>
        <nav className="admin-nav" aria-label="DAO navigation">
          <div className="nav-caption">WORKSPACE</div>
          {nav.map(([to, label, Icon, badge, exact]) => {
            const active = exact ? pathname === to : pathname.startsWith(to);
            const count = to === "/app/proposals" ? String(proposalCount) : "";
            return <Link className={active ? "active" : ""} key={to} to={to}><Icon size={16} /><span>{label}</span>{(badge || count) && <b>{badge || count}</b>}</Link>;
          })}
        </nav>
        <div className="network-status"><i /> <span>BITCOIN {settings.network === "REGTEST" ? "REGTEST" : "MAINNET"}</span><strong>{settings.relays.length} RELAYS {org.seedUnlocked ? "· SEED LIVE" : ""}</strong><small>{settings.relays[0]}</small></div>
      </aside>
      <div className="admin-main">
        <header className="admin-header"><label className="admin-search"><Search size={15} /><input placeholder="Search proposals, members, transactions" /></label><div className="admin-actions"><Link className="new-proposal" to="/app/proposals"><Plus size={15} /> NEW PROPOSAL</Link><button className="icon-button" type="button" aria-label="Notifications"><Bell size={16} /><i /></button><div className="user-chip"><span>{signer.npub.slice(5, 7).toUpperCase()}</span><small title={signer.npub}>{shortNpub(signer.npub)} · {signer.method.toUpperCase()}</small></div>{org.seedUnlocked ? <button className="icon-button" type="button" aria-label="Lock treasury" title="Lock treasury seed" onClick={lockTreasury}><Lock size={16} /></button> : null}<button className="icon-button" type="button" aria-label="Sign out" title="Sign out" onClick={signOut}><LogOut size={16} /></button></div></header>
        <main className="admin-content"><Outlet /></main>
      </div>
    </div>
  );
};
