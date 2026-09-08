import { Bell, ChevronDown, LayoutDashboard, Plus, Radio, Search, Send, Settings, Users, Vote, Wallet } from "lucide-react";
import { Link, Outlet, useLocation } from "react-router-dom";

const nav = [
  ["/app", "Dashboard", LayoutDashboard, "", true],
  ["/app/proposals", "Proposals", Vote, "04", false],
  ["/app/treasury", "Treasury", Wallet, "", false],
  ["/app/members", "Members", Users, "", false],
  ["/app/payments", "Payments", Send, "", false],
  ["/app/feed", "Nostr feed", Radio, "LIVE", false],
  ["/app/settings", "Settings", Settings, "", false],
] as const;

export const AppPage = () => {
  const { pathname } = useLocation();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand"><Link to="/">BIT<span>MOOT</span><b>.</b></Link><small>PLEBS LABEL / MAINNET</small></div>
        <button className="org-switcher" type="button"><span className="org-mark">PL</span><span><strong>Plebs Label</strong><small>npub1q2…7xa3</small></span><ChevronDown size={14} /></button>
        <nav className="admin-nav" aria-label="DAO navigation">
          <div className="nav-caption">WORKSPACE</div>
          {nav.map(([to, label, Icon, badge, exact]) => {
            const active = exact ? pathname === to : pathname.startsWith(to);
            return <Link className={active ? "active" : ""} key={to} to={to}><Icon size={16} /><span>{label}</span>{badge && <b>{badge}</b>}</Link>;
          })}
        </nav>
        <div className="network-status"><i /> <span>BITCOIN MAINNET</span><strong>BLOCK 901,442</strong><small>relay.bitmoot.xyz · 42ms</small></div>
      </aside>
      <div className="admin-main">
        <header className="admin-header"><label className="admin-search"><Search size={15} /><input placeholder="Search proposals, members, transactions" /></label><div className="admin-actions"><Link className="new-proposal" to="/app/proposals"><Plus size={15} /> NEW PROPOSAL</Link><button className="icon-button" type="button" aria-label="Notifications"><Bell size={16} /><i /></button><div className="user-chip"><span>SK</span><small>SATOSHI K.</small></div></div></header>
        <main className="admin-content"><Outlet /></main>
      </div>
    </div>
  );
};