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
import { profileLabel, useProfile } from "../lib/profile";
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

/** Shared micro-label style: 9px IBM Plex Mono, uppercase, wide tracking. */
const caption = "font-mono text-[9px] uppercase tracking-[.1em]";

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
      <Link
        className={`mb-0.5 flex items-center gap-[11px] border-l border-transparent px-2.5 py-2.5 text-[13px] transition-colors duration-150 hover:text-ink-hi motion-reduce:transition-none ${
          active ? "border-l-sats bg-bg-inset text-ink-hi [&>svg]:text-sats" : "text-ink-mid"
        }`}
        key={item.to}
        to={item.to}
      >
        <item.icon size={16} />
        <span className="flex-1">{item.label}</span>
        {item.to === "/app/proposals" && openProposals > 0 && (
          <b className="font-mono text-[9px] text-sats">{openProposals}</b>
        )}
      </Link>
    );
  };

  return (
    /* Shell-wide design overrides: sharp corners, no shadows, no blur, flat panels. */
    <div className="flex min-h-screen bg-bg-void font-display text-ink-hi [&_.rounded-full]:rounded-[2px] [&_.rounded-lg]:rounded-[2px] [&_.rounded-md]:rounded-[2px] [&_[class*='backdrop-blur']]:backdrop-blur-none [&_[class*='bg-gradient']]:bg-bg-panel [&_[class*='shadow-']]:shadow-none">
      <aside className="sticky top-0 flex min-h-screen shrink-0 grow-0 basis-[232px] flex-col border-r border-rule bg-bg-panel px-3.5 pb-4 max-[640px]:hidden max-[900px]:basis-[190px]">
        <div className="flex flex-col gap-1 border-b border-rule px-2.5 pt-[22px] pb-[18px]">
          <Link className="font-mono text-[15px] font-semibold tracking-[.14em]" to="/">
            BIT<span className="font-light">MOOT</span>
            <b className="text-sats">.</b>
          </Link>
          <small className={`${caption} text-ink-low`}>
            {settings.network === "REGTEST" ? "TEST NETWORK" : "LIVE NETWORK"}
          </small>
        </div>

        <details ref={orgSwitcherRef} className="relative [&>summary]:list-none [&>summary::-webkit-details-marker]:hidden">
          <summary
            aria-label="Switch organization"
            className="mt-4 mb-6 flex w-full cursor-pointer items-center gap-[9px] border border-rule bg-bg-inset p-[9px] text-left transition-colors duration-150 hover:border-rule-strong motion-reduce:transition-none"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-sats font-mono text-[10px] font-semibold text-bg-void">
              {orgProfile?.picture
                ? <img src={orgProfile.picture} alt="" className="h-full w-full rounded-[inherit] object-cover" />
                : orgName.slice(0, 2).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <strong className="text-xs font-medium">{orgName}</strong>
              <small className={`mt-0.5 truncate ${caption} text-ink-low`}>
                {org.orgNpub ? shortNpub(org.orgNpub) : "choose an organization"}
              </small>
            </span>
            <ChevronDown size={14} className="shrink-0 text-ink-low" />
          </summary>
          <div className="absolute inset-x-0 top-[calc(100%+4px)] z-30 max-h-[300px] overflow-auto border border-rule-strong bg-bg-panel">
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

        <nav className="flex-1" aria-label="Main navigation">
          {hasOrgAccess && (
            <>
              <div className={`px-2.5 pb-[9px] ${caption} text-ink-low`}>
                {isAdmin ? "ORGANIZATION" : "ORGANIZATION · READ ONLY"}
              </div>
              {orgNav.map(renderItem)}
            </>
          )}
          <div className={`px-2.5 pb-[9px] ${caption} text-ink-low`}>
            {hasOrgAccess ? "YOUR ACCOUNT" : "NO ORGANIZATION YET"}
          </div>
          {accountNav.map(renderItem)}
        </nav>

        <div className={`grid grid-cols-[10px_1fr] gap-1 border-t border-rule px-[9px] pt-[18px] ${caption} text-ink-low`}>
          <i className="h-1.5 w-1.5 rounded-full bg-stable" /> <span className="col-start-2">CONNECTED</span>
          <strong className={`col-start-2 font-normal ${caption} text-ink-mid`}>
            {settings.relays.length} RELAYS {org.seedUnlocked ? "· WALLET OPEN" : ""}
          </strong>
          <small className="col-start-2">{settings.relays[0]}</small>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-[5] flex h-16 items-center justify-between border-b border-rule bg-[color-mix(in_srgb,var(--bg-void)_94%,transparent)] px-[clamp(18px,3vw,42px)] max-[640px]:h-[58px]">
          <div className="text-sm text-muted-foreground">
            {hasOrgAccess ? org.config?.name ?? "Your organization" : "Your Nostr account"}
            {hasOrgAccess && openProposals > 0 && (
              <span className="ml-2 text-primary">· {openProposals} proposals to review</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {hasOrgAccess && needsMyVote > 0 && (
              <Link
                className="bg-primary flex items-center gap-2 border border-sats px-[11px] py-2 font-mono text-[10px] text-black transition-colors duration-150 motion-reduce:transition-none max-[640px]:gap-0 max-[640px]:p-2 max-[640px]:text-[0]"
                to="/app/proposals"
                title={`${needsMyVote} proposal(s) waiting for your vote`}
              >
                <Vote size={15} /> VOTE NOW{needsMyVote > 1 ? ` (${needsMyVote})` : ""}
              </Link>
            )}
            {hasOrgAccess && (
              <Link
                className="flex items-center gap-2 border border-sats px-[11px] py-2 font-mono text-[10px] text-sats transition-colors duration-150 hover:bg-sats hover:text-bg-void motion-reduce:transition-none max-[640px]:gap-0 max-[640px]:p-2 max-[640px]:text-[0]"
                to="/app/proposals"
              >
                <Plus size={15} /> NEW PROPOSAL
              </Link>
            )}
            <Link to="/app/profile" className="flex items-center gap-2">
              <Avatar name={profileLabel(signer.pubkey, profile)} src={profile?.picture} size={28} />
              <small title={signer.npub} className="hidden text-[11px] text-muted-foreground sm:block">
                {profileLabel(signer.pubkey, profile)}
              </small>
            </Link>
            {isAdmin && org.seedUnlocked && (
              <button
                className="relative cursor-pointer border-0 bg-transparent text-ink-mid"
                type="button"
                aria-label="Lock treasury"
                title="Lock treasury"
                onClick={lockTreasury}
              >
                <Lock size={16} />
              </button>
            )}
            <button
              className="relative cursor-pointer border-0 bg-transparent text-ink-mid"
              type="button"
              aria-label="Sign out"
              title="Sign out"
              onClick={handleSignOut}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-[clamp(18px,4vw,60px)] pt-[clamp(28px,4vw,56px)] pb-20">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
