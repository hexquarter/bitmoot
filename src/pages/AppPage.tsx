import { useEffect, useRef } from "react";
import {
  Check,
  ChevronDown,
  Home,
  LogOut,
  Lock,
  Plus,
  Radio,
  Send,
  Settings,
  UserRound,
  Users,
  Vote,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useAutoSubmitPayments } from "../lib/autoPay";
import { lockTreasury, shortNpub, useOrg } from "../lib/org";
import { switchOrg, useMyOrgs } from "../lib/orgs";
import { profileLabel, useProfile, useProfiles } from "../lib/profile";
import { logOut } from "../lib/session";
import { useSettings } from "../lib/settings";
import { Avatar } from "../components/ui";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

const orgNav: NavItem[] = [
  { to: "/app", label: "Home", icon: Home, exact: true },
  { to: "/app/proposals", label: "Proposals", icon: Vote },
  { to: "/app/treasury", label: "Treasury", icon: Wallet },
  { to: "/app/members", label: "Members", icon: Users },
  { to: "/app/payments", label: "Payments", icon: Send },
  { to: "/app/feed", label: "Feed", icon: Radio },
];

const accountNav: NavItem[] = [
  { to: "/app/profile", label: "Profile", icon: UserRound },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

const orgRoutes = orgNav.filter((item) => !item.exact).map((item) => item.to);

export const AppPage = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { signer } = useAuth();
  const org = useOrg();
  const settings = useSettings();
  const profile = useProfile(signer?.pubkey);
  const orgProfile = useProfile(org.orgPubkey);
  const { orgs } = useMyOrgs();
  const orgSwitcherRef = useRef<HTMLDetailsElement>(null);
  useAutoSubmitPayments();

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      const switcher = orgSwitcherRef.current;
      if (!switcher?.open || !(target instanceof Node)) return;
      if (!switcher.contains(target)) switcher.open = false;
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("touchstart", closeOnOutsideClick);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("touchstart", closeOnOutsideClick);
    };
  }, []);

  if (!signer) return <Navigate to="/auth" replace />;

  const isAdmin = org.myRole === "admin";
  const hasOrgAccess = isAdmin || org.myRole === "member";
  const onOrgRoute = orgRoutes.some((route) => pathname.startsWith(route));

  // Guests, pending joiners and signed-in users without an org get only
  // their Nostr profile and settings — no treasury/proposal/navigation entries.
  // While the active org is still resolving, show a loading state instead of
  // bouncing a member back to /app on a direct link or refresh.
  if (onOrgRoute && !hasOrgAccess) {
    if (settings.activeOrgNpub && (org.loading || !org.config)) {
      return (
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
          Loading your organization…
        </div>
      );
    }
    return <Navigate to="/app" replace />;
  }

  const orgName = org.config?.name ?? (org.loading ? "Loading…" : "No organization");
  const openProposals = org.proposals.filter((p) => !p.executed).length;
  const needsMyVote = org.proposals.filter(
    (p) => !p.executed && !p.passed && !p.votes.some((v) => v.author === signer.pubkey),
  ).length;

  const handleSignOut = () => {
    logOut();
    toast.success("Signed out");
    navigate("/auth", { replace: true });
  };

  const renderItem = (item: NavItem) => {
    const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
    return (
      <Link className={active ? "active" : ""} key={item.to} to={item.to}>
        <item.icon size={16} />
        <span>{item.label}</span>
        {item.to === "/app/proposals" && openProposals > 0 && <b>{openProposals}</b>}
      </Link>
    );
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <Link to="/">BIT<span>MOOT</span><b>.</b></Link>
          <small>{settings.network === "REGTEST" ? "TEST NETWORK" : "LIVE NETWORK"}</small>
        </div>

        <details ref={orgSwitcherRef} className="org-switcher-shell">
          <summary className="org-switcher" aria-label="Switch organization">
            <span className="org-mark">
              {orgProfile?.picture
                ? <img src={orgProfile.picture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
                : orgName.slice(0, 2).toUpperCase()}
            </span>
            <span>
              <strong>{orgName}</strong>
              <small>{org.orgNpub ? shortNpub(org.orgNpub) : "choose an organization"}</small>
            </span>
            <ChevronDown size={14} />
          </summary>
          <div className="org-menu">
            {orgs.length === 0 && <p className="px-3 py-2 text-[11px] text-muted-foreground">No organizations found yet.</p>}
            {orgs.map((item) => (
              <button
                key={item.pubkey}
                type="button"
                onClick={() => switchOrg(item.npub)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-bg-elev-2/60"
              >
                <span className="flex-1 truncate">{item.name}</span>
                {settings.activeOrgNpub === item.npub && <Check size={13} className="text-primary" />}
              </button>
            ))}
            <Link to="/app" className="block border-t border-border px-3 py-2 text-[11px] text-primary">
              + Create or join an organization
            </Link>
          </div>
        </details>

        <nav className="admin-nav" aria-label="Main navigation">
          {hasOrgAccess && (
            <>
              <div className="nav-caption">{isAdmin ? "ORGANIZATION" : "ORGANIZATION · READ ONLY"}</div>
              {orgNav.map(renderItem)}
            </>
          )}
          <div className="nav-caption">{hasOrgAccess ? "YOUR ACCOUNT" : "NO ORGANIZATION YET"}</div>
          {accountNav.map(renderItem)}
        </nav>

        <div className="network-status">
          <i /> <span>CONNECTED</span>
          <strong>{settings.relays.length} RELAYS {org.seedUnlocked ? "· WALLET OPEN" : ""}</strong>
          <small>{settings.relays[0]}</small>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-header">
          <div className="text-sm text-muted-foreground">
            {hasOrgAccess ? org.config?.name ?? "Your organization" : "Your Nostr account"}
            {hasOrgAccess && openProposals > 0 && (
              <span className="ml-2 text-primary">· {openProposals} proposals to review</span>
            )}
          </div>
          <div className="admin-actions">
            {hasOrgAccess && needsMyVote > 0 && (
              <Link className="new-proposal flex items-center gap-2" to="/app/proposals" title={`${needsMyVote} proposal(s) waiting for your vote`}>
                <Vote size={15} /> VOTE NOW{needsMyVote > 1 ? ` (${needsMyVote})` : ""}
              </Link>
            )}
            {hasOrgAccess && (
              <Link className="new-proposal flex items-center gap-2" to="/app/proposals"><Plus size={15} /> NEW PROPOSAL</Link>
            )}
            <Link to="/app/profile" className="flex items-center gap-2">
              <Avatar name={profileLabel(signer.pubkey, profile)} src={profile?.picture} size={28} />
              <small title={signer.npub} className="hidden text-[11px] text-muted-foreground sm:block">
                {profileLabel(signer.pubkey, profile)}
              </small>
            </Link>
            {isAdmin && org.seedUnlocked && (
              <button className="icon-button" type="button" aria-label="Lock treasury" title="Lock treasury" onClick={lockTreasury}>
                <Lock size={16} />
              </button>
            )}
            <button className="icon-button" type="button" aria-label="Sign out" title="Sign out" onClick={handleSignOut}>
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <main className="admin-content"><Outlet /></main>
      </div>
    </div>
  );
};
