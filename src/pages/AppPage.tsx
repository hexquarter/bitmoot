import {
    Bitcoin,
    LayoutDashboard,
    Vote,
    Wallet,
    Users,
    Send,
    Settings,
    Bell,
    Search,
    ChevronDown,
    Plus,
    Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, Outlet, useLocation } from "react-router-dom";

export const AppPage = () => {
    type NavItem = {
        to: "/app" | "/app/proposals" | "/app/treasury" | "/app/members" | "/app/payments" | "/app/feed" | "/app/settings";
        label: string;
        icon: typeof LayoutDashboard;
        exact?: boolean;
        badge?: string;
    };

    const nav: NavItem[] = [
        { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
        { to: "/app/proposals", label: "Proposals", icon: Vote, badge: "4" },
        { to: "/app/treasury", label: "Treasury", icon: Wallet },
        { to: "/app/members", label: "Members", icon: Users },
        { to: "/app/payments", label: "Payments", icon: Send },
        { to: "/app/feed", label: "Nostr feed", icon: Radio, badge: "live" },
        { to: "/app/settings", label: "Settings", icon: Settings },
    ];

    const location = useLocation()
    const pathname = location.pathname

    return (
        <div className="min-h-screen w-full bg-background text-foreground flex">
            {/* Sidebar */}
            <aside className="hidden md:flex 2xl:w-1/9 lg:w-1/6 md:w-1/4 shrink-0 flex-col border-r border-border bg-bg-elev-1/40 sticky top-0 h-screen">
                <div className="px-5 py-5 border-b border-borde h-16">
                    <Link to="/" className="flex items-center gap-2.5 group">
                        <div className="leading-tight">
                            <span className="font-mono text-sm font-semibold tracking-tight">
                                BitMoot<span className="text-primary">.</span>
                            </span>
                        </div>
                    </Link>
                </div>

                {/* Org switcher */}
                <button className="mx-3 mt-4 flex items-center justify-between gap-2 rounded-md border border-border bg-bg-elev-2/50 hover:border-border-bright px-3 py-2.5 text-left transition">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="h-7 w-7 rounded bg-gradient-to-br from-primary to-[oklch(0.82_0.17_70)] flex items-center justify-center text-[11px] font-bold text-primary-foreground">PL</div>
                        <div className="min-w-0">
                            <div className="text-sm font-medium truncate">Plebs Label</div>
                            <div className="text-[10px] font-mono text-muted-foreground-2 truncate">npub1q2…7xa3</div>
                        </div>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>

                <nav className="mt-4 px-2 space-y-0.5 flex-1">
                    {nav.map((item) => {
                        const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
                        const Icon = item.icon;
                        return (
                            <Link
                                key={item.to}
                                to={item.to}
                                className={cn(
                                    "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition relative",
                                    active
                                        ? "bg-primary-dim text-foreground"
                                        : "text-muted-foreground hover:text-foreground hover:bg-bg-elev-2/60"
                                )}
                            >
                                {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary" />}
                                <Icon className={cn("h-4 w-4", active && "text-primary")} />
                                <span className="flex-1">{item.label}</span>
                                {item.badge && (
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                                        {item.badge}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                <div className="m-3 rounded-lg border border-border bg-bg-elev-2/50 p-3">
                    <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--green)] pulse-dot" />
                        Mainnet · Block 901,442
                    </div>
                </div>
            </aside>

            {/* Main */}
            <div className="flex-1 min-w-0 flex flex-col">
                <header className="sticky top-0 z-20 h-16 border-b border-border bg-background/80 backdrop-blur flex items-center gap-3 px-5 justify-between">
                    <div className="flex-1 max-w-md relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                            placeholder="Search proposals, members, txs…"
                            className="w-full h-9 rounded-md border border-border bg-bg-elev-1/50 pl-9 pr-3 text-sm placeholder:text-muted-foreground-2 focus:outline-none focus:border-primary/60 focus:bg-bg-elev-2/60 transition"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button className="h-9 px-3 rounded-md border border-border bg-bg-elev-1/50 text-sm flex items-center gap-2 hover:border-border-bright transition">
                            <Plus className="h-4 w-4 text-primary" />
                            <span className="hidden sm:inline">New proposal</span>
                        </button>
                        <button className="h-9 w-9 rounded-md border border-border bg-bg-elev-1/50 flex items-center justify-center hover:border-border-bright transition relative">
                            <Bell className="h-4 w-4" />
                            <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-primary" />
                        </button>
                        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-[oklch(0.82_0.17_70)] flex items-center justify-center text-xs font-bold text-primary-foreground">SK</div>
                    </div>
                </header>

                <main className="flex-1 px-5 md:px-8 py-6 md:py-8">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}