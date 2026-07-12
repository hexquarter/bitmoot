import {
  Bitcoin, Zap, Shield, Vote, Wallet, Radio, ArrowRight,
  Users, Palette, Code2, HandCoins, Globe2, Rocket,
  CheckCircle2, Fingerprint, Coins, Timer, MousePointerClick,
  Lock, Send, Activity

} from "lucide-react";

import { IconBrandGithub } from '@tabler/icons-react'

import ProposalImg from '../assets/proposals.png'
import TreasuryImg from '../assets/treasury.png'
import PaymentImg from '../assets/payments.png'
import FeedImg from '../assets/feed.png'

function Pill({
  children,
  tone = "orange",
}: {
  children: React.ReactNode;
  tone?: "orange" | "green" | "yellow" | "blue" | "purple" | "dim";
}) {
  const tones: Record<string, string> = {
    orange: "border-primary text-primary bg-[var(--primary-dim)]",
    green:
      "border-[var(--green)] text-[var(--green)] bg-[color-mix(in_oklab,var(--green)_12%,transparent)]",
    yellow:
      "border-[var(--yellow)] text-[var(--yellow)] bg-[color-mix(in_oklab,var(--yellow)_12%,transparent)]",
    blue: "border-[var(--blue)] text-[var(--blue)] bg-[color-mix(in_oklab,var(--blue)_12%,transparent)]",
    purple:
      "border-[var(--purple)] text-[var(--purple)] bg-[color-mix(in_oklab,var(--purple)_12%,transparent)]",
    dim: "border-border-bright text-muted-foreground bg-bg-elev-1",
  };
  return (
    <span
      className={`font-mono text-[11px] px-2.5 py-1 rounded-sm border whitespace-nowrap transition-transform hover:-translate-y-px ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

const useCases = [
  {
    icon: Palette,
    tag: "Creator collectives",
    title: "Run a studio, share the upside",
    body: "Pool revenue from a label, magazine, or production house. Members vote on releases, contributors earn a share streamed in stablecoins.",
    chips: ["Music labels", "Film co-ops", "Magazines"],
  },
  {
    icon: HandCoins,
    tag: "Investment clubs",
    title: "Pool capital, decide together",
    body: "A multisig treasury anyone can audit. Propose a deal, vote, and the disbursement happens — no spreadsheet, no admin holding the wire.",
    chips: ["Angel syndicates", "Real-world assets", "Bitcoin treasuries"],
  },
  {
    icon: Code2,
    tag: "Open-source guilds",
    title: "Fund the work, not the politics",
    body: "Distribute grants by proposal. Contributors get paid per-second in USDB while they ship. Reputation lives on Nostr — portable, yours.",
    chips: ["Dev guilds", "Protocol DAOs", "Bounty pools"],
  },
  {
    icon: Users,
    tag: "Local communities",
    title: "Co-own a space or a cause",
    body: "From a neighborhood fund to a global club — collect dues, vote on spend, publish a transparent ledger. No bank, no foundation needed.",
    chips: ["Coworking", "Mutual aid", "Activist funds"],
  },
];

const stack = [
  {
    n: "01",
    name: "Govern",
    icon: Vote,
    title: "Proposals & votes that just work",
    body: "Draft a proposal, attach a budget, set a deadline. Members vote from the app. Results are signed, public and tamper-evident.",
    chips: ["Nostr Events", "Token-weighted", "1p1v option"],
    img: ProposalImg,
  },
  {
    n: "02",
    name: "Treasury",
    icon: Wallet,
    title: "A multisig your bank wishes it had",
    body: "Funds sit in a Bitcoin Taproot multisig you actually own. M-of-N co-signers, a built-in timelock recovery — no custodian can freeze you.",
    chips: ["Taproot Multisig", "Timelock backup", "Hardware-wallet ready"],
    img: TreasuryImg,
  },
  {
    n: "03",
    name: "Pay",
    icon: Zap,
    title: "Payments in seconds",
    body: "Pay contributors in USDB by the second, send grants over Lightning, or zap a great proposal.",
    chips: ["Lightning invoices", "On-chain payments", "USDB streaming"],
    img: PaymentImg
  },
  {
    n: "04",
    name: "Communicate",
    icon: Fingerprint,
    title: "Control your audience",
    body: "Build your organization Nostr communication from within the DAO. No need to switch tools. Govern, pay and communicate at once.",
    chips: ['Nostr feed', 'Audience ownership'],
    img: FeedImg
  },
];

export const Index = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* HEADER */}
      <header className="border-b border-border/70 sticky top-0 z-30 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex flex-col leading-none">
              <span className="font-mono text-sm font-semibold tracking-tight">
                BitMoot<span className="text-primary">.</span>
              </span>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-7 font-mono text-[11px] tracking-widest uppercase text-muted-foreground">
            <a href="#use-cases" className="hover:text-foreground transition">Use cases</a>
            <a href="#how" className="hover:text-foreground transition">How it works</a>
            <a href="#why" className="hover:text-foreground transition">Why sovereign</a>
            <a href="#pricing" className="hover:text-foreground transition">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <a
              href="#start"
              className="group font-mono text-[11px] tracking-wider uppercase px-3.5 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition inline-flex items-center gap-1.5 shadow-[var(--glow-primary)]"
            >
              Start a DAO <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition" />
            </a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border grain">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse 80% 60% at 50% 30%, black 40%, transparent 80%)",
          }}
        />
        <div
          aria-hidden
          className="absolute -top-60 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(closest-side, var(--primary-mid), transparent 70%)",
          }}
        />
        <div className="relative max-w-[1400px] mx-auto px-6 md:px-10 pt-16 md:pt-24 pb-20 md:pb-28">
          <div className="grid lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.25em] uppercase text-primary mb-6 border border-primary/30 bg-[var(--primary-dim)] px-3 py-1.5 rounded-full backdrop-blur">
                <span className="w-1.5 h-1.5 rounded-full bg-primary pulse-dot" />
                BITCOIN DAO FACTORY
              </div>
              <h1 className="tracking-tight text-5xl md:text-6xl lg:text-7xl leading-[1.02] max-w-4xl font-semibold">
                <span className="font-serif italic font-normal text-primary">Sovereign</span> coordination,
                <br />settled on <span className="text-primary">Bitcoin</span>.
              </h1>
              <p className="mt-6 max-w-xl text-base md:text-lg text-muted-foreground font-light leading-relaxed">
                The simplest way to run a DAO on the only money that can't be inflated. <br />Vote on Nostr, custody on Taproot multisig, pay over Lightning.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <a
                  href="#start"
                  className="group inline-flex items-center gap-2 font-mono text-xs tracking-wider uppercase px-5 py-3.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition shadow-[var(--glow-primary)]"
                >
                  Launch your DAO <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
                </a>
                <a
                  href="#how"
                  className="inline-flex items-center gap-2 font-mono text-xs tracking-wider uppercase px-5 py-3.5 rounded-md border border-border-bright text-foreground hover:bg-bg-elev-1 transition"
                >
                  <MousePointerClick className="w-3.5 h-3.5" /> See how it works
                </a>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground font-light">
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-[var(--green)]" /> Self-custody by default</span>
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-[var(--green)]" /> Bitcoin-only</span>
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-[var(--green)]" /> Nostr-based</span>
              </div>
            </div>

            {/* HERO TERMINAL MOCK */}
            <div className="lg:col-span-5 relative animate-float">
              <div
                aria-hidden
                className="absolute -inset-6 rounded-2xl pointer-events-none"
                style={{ background: "var(--gradient-hero)" }}
              />
              <div className="relative rounded-xl border border-border-bright bg-bg-elev-1/80 backdrop-blur-sm shadow-2xl overflow-hidden">
                <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-bg-elev-2/60">
                  <span className="w-2.5 h-2.5 rounded-full bg-destructive/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[var(--yellow)]/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[var(--green)]/70" />
                  <div className="ml-3 font-mono text-[10px] tracking-widest uppercase text-muted-foreground-2">
                    studio-halftone.bitmoot.xyz
                  </div>
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground-2">Treasury</div>
                      <div className="mt-1 font-mono text-2xl font-semibold">
                        ₿ 2.847
                        <span className="text-sm text-muted-foreground font-light ml-2">≈ $189,420</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest uppercase text-[var(--green)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] pulse-dot" />
                      Confirmed
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 font-mono text-[10px]">
                    {[["3-of-5", "MULTISIG"], ["12", "MEMBERS"], ["4", "OPEN PROPOSALS"]].map(([v, l]) => (
                      <div key={l} className="rounded-md border border-border bg-background/40 px-3 py-2">
                        <div className="text-foreground text-sm">{v}</div>
                        <div className="text-muted-foreground-2 tracking-widest mt-0.5">{l}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 space-y-2.5">
                    {[
                      { i: Vote, t: "Proposal #042 · Q2 video grants", s: "Voting · 8/12", c: "var(--primary)" },
                      { i: Send, t: "Stream · @ana 2,400 USDB / mo", s: "Active", c: "var(--green)" },
                      { i: Lock, t: "Multisig signed · 3/5", s: "Broadcasting…", c: "var(--blue)" },
                    ].map(({ i: Ic, t, s, c }) => (
                      <div key={t} className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-border bg-background/40">
                        <Ic className="w-4 h-4 shrink-0" style={{ color: c }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs truncate">{t}</div>
                          <div className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground-2 mt-0.5">{s}</div>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground-2" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="px-5 py-3 border-t border-border bg-bg-elev-2/40 flex items-center justify-between font-mono text-[10px] tracking-widest uppercase text-muted-foreground-2">
                  <span className="inline-flex items-center gap-1.5"><Activity className="w-3 h-3 text-[var(--green)]" /> Relay · wss://relay.bitmoot.xyz</span>
                  <span>Block 884,210</span>
                </div>
              </div>
            </div>
          </div>

          {/* stat row */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border rounded-lg overflow-hidden">
            {[
              ["< 5 min", "From sign-up to first vote"],
              ["$0", "To launch · pay only when you spend"],
              ["100%", "Self-custodied treasury"],
              ["∞", "Members, proposals, payouts"],
            ].map(([v, l]) => (
              <div key={l} className="bg-background p-5 hover:bg-bg-elev-1 transition group">
                <div className="font-mono text-2xl md:text-3xl text-primary group-hover:scale-[1.02] transition origin-left">{v}</div>
                <div className="mt-1 font-mono text-[10px] tracking-widest uppercase text-muted-foreground">{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* MARQUEE — sovereign tech ethos */}
        <div className="relative border-t border-border/70 bg-bg-elev-1/40 overflow-hidden">
          <div className="flex animate-marquee whitespace-nowrap py-4 font-mono text-[11px] tracking-[0.3em] uppercase text-muted-foreground-2">
            {Array.from({ length: 2 }).map((_, k) => (
              <div key={k} className="flex shrink-0 items-center gap-10 px-5">
                {[
                  "21M cap forever",
                  "Don't trust · verify",
                  "Not your keys · not your DAO",
                  "Censorship-resistant by design",
                  "Run your own relay",
                  "Proof, not promises",
                  "Sound money · sovereign coordination",
                ].map((t) => (
                  <span key={t} className="inline-flex items-center gap-3">
                    <Bitcoin className="w-3 h-3 text-primary" /> {t}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* USE CASES */}
      <section id="use-cases" className="border-b border-border">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-20">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-primary mb-3">
            Use cases
          </div>
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight max-w-3xl leading-[1.1]">
            Built for whoever wants to <span className="font-serif italic font-normal text-primary">build together</span>.
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground font-light">
            Whether you're a five-person studio or a thousand-member guild, the playbook is the same: a treasury, a vote, and a payout that actually clears.
          </p>

          <div className="mt-10 grid md:grid-cols-2 gap-px bg-border border border-border rounded-md overflow-hidden">
            {useCases.map((u) => (
              <div key={u.tag} className="bg-background p-7 hover:bg-bg-elev-1 transition group">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="w-10 h-10 rounded-md grid place-items-center bg-[var(--primary-dim)] text-primary group-hover:scale-105 transition">
                    <u.icon className="w-5 h-5" />
                  </div>
                  <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground-2">
                    {u.tag}
                  </div>
                </div>
                <h3 className="font-mono text-lg font-semibold tracking-tight">{u.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground font-light leading-relaxed">{u.body}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {u.chips.map((c) => (
                    <span key={c} className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground-2 border border-border px-2 py-1 rounded-sm">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="border-b border-border">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-20">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-primary mb-3">
            How it works
          </div>
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight max-w-3xl leading-[1.1]">
            Govern, pay and communicate over your Bitcoin organization. 
          </h2>

          <div className="mt-10 grid md:grid-cols-2 gap-4">
            {stack.map((s) => (
              <div
                key={s.n}
                className="border border-border rounded-md p-6 hover:border-border-bright hover:bg-bg-elev-1 transition group relative overflow-hidden"
              >
                <div
                  aria-hidden
                  className="absolute -top-px left-0 right-0 h-px bg-[var(--gradient-primary)] opacity-0 group-hover:opacity-100 transition"
                />
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-md grid place-items-center bg-[var(--primary-dim)] text-primary">
                    <s.icon className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <div className="font-mono text-[10px] tracking-widest text-muted-foreground-2">
                      Step {s.n} · {s.name}
                    </div>
                    <div className="font-mono text-base font-semibold">{s.title}</div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground font-light leading-relaxed">{s.body}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {s.chips.map((c) => (
                    <span key={c} className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground-2 border border-border px-2 py-1 rounded-sm">
                      {c}
                    </span>
                  ))}
                </div>
                <img src={s.img} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPARISON / WHY */}
      <section id="why" className="border-b border-border">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-20">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-primary mb-3">
            Why sovereign tech
          </div>
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight max-w-3xl leading-[1.1]">
            All the upside of a DAO. <span className="font-serif italic font-normal text-primary">None</span> of the usual baggage.
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground font-light">
            We picked the boring, durable parts of crypto and hid the rest. Here's what changes for you.
          </p>

          <div className="mt-10 grid md:grid-cols-3 gap-px bg-border border border-border rounded-md overflow-hidden">
            {[
              { i: Globe2, h: "No chain politics", b: "We don't pick winners between L2s. Your treasury settles on Bitcoin — the asset everyone already trusts." },
              { i: Shield, h: "You hold the keys", b: "Funds live in a multisig you control. We can't pause, freeze or rug you. Built-in timelock recovery if a co-signer disappears." },
              { i: Coins, h: "Stablecoin payroll", b: "Pay contributors in USDB so nobody loses lunch money to a bad week. Volatility stays optional." },
              { i: Radio, h: "Portable identity", b: "Members log in once and carry their reputation across every Nostr-native app. Your community is never locked in." },
              { i: Timer, h: "Real-time disbursement", b: "Stream salaries by the second. Reserve formal votes for the calls that actually matter." },
              { i: Rocket, h: "Grow without re-platforming", b: "Start as a club, scale into a fund, fork into a federation. Same stack the whole way up." },
            ].map(({ i: Icon, h, b }) => (
              <div key={h} className="bg-background p-6">
                <Icon className="w-5 h-5 text-primary mb-3" />
                <div className="font-mono text-sm font-semibold mb-1.5">{h}</div>
                <div className="text-sm text-muted-foreground font-light leading-relaxed">{b}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIAL / SOCIAL PROOF */}
      {/* <section className="border-b border-border">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-20 grid md:grid-cols-3 gap-8">
          <div className="md:col-span-1">
            <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-primary mb-3">
              In the wild
            </div>
            <h3 className="text-2xl md:text-3xl font-semibold tracking-tight leading-tight">
              Communities already coordinating on <span className="font-serif italic font-normal text-primary">BitMoot</span>.
            </h3>
          </div>
          <div className="md:col-span-2 grid sm:grid-cols-2 gap-4">
            {[
              {
                q: "We replaced a Stripe + Notion + group-chat treasury with a single multisig in an afternoon. Members actually vote now.",
                a: "Crays · Studio Halftone (12 members)",
              },
              {
                q: "The streaming USDB payroll is the killer feature. Contributors stop chasing invoices and start shipping.",
                a: "Marc · Otterhash Open Source Guild",
              },
            ].map((t) => (
              <blockquote key={t.a} className="border border-border rounded-md p-6 bg-bg-elev-1">
                <p className="text-sm text-foreground/90 leading-relaxed font-light">"{t.q}"</p>
                <footer className="mt-4 font-mono text-[10px] tracking-widest uppercase text-muted-foreground-2">
                  {t.a}
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section> */}

      {/* PRICING */}
      <section id="pricing" className="border-b border-border">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-20">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-primary mb-3">
            Pricing
          </div>
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-[1.1]">
            Free to launch. <span className="font-serif italic font-normal text-primary">Honest</span> when you scale.
          </h2>

          <div className="mt-10 grid md:grid-cols-2 lg:w-2/3 mx-auto gap-4">
            {[
              {
                name: "Starter",
                price: "$0",
                desc: "Spin up a DAO, invite friends, run your first vote.",
                items: ["Unlimited members", "Multisig treasury", "Proposals & voting", "Manual coordination"],
                cta: "Start for free",
                featured: false,
              },
              {
                name: "Collective",
                price: "$49",
                sub: "/ mo",
                desc: "For studios, guilds and clubs that ship every week.",
                items: ["Coordinator service", "Automated voting & payments", "USDB treasury (non-volatile) with 3.5-6% APY yield", , "Dedicated support"],
                cta: "Scale with automation",
                featured: true,
              }
            ].map((p) => (
              <div
                key={p.name}
                className={`relative rounded-md p-7 border transition ${p.featured
                    ? "border-primary bg-bg-elev-1 shadow-[var(--glow-primary)]"
                    : "border-border hover:border-border-bright"
                  }`}
              >
                {p.featured && (
                  <div className="absolute -top-3 left-7 font-mono text-[10px] tracking-widest uppercase bg-primary text-primary-foreground px-2 py-1 rounded-sm">
                    Premium-service
                  </div>
                )}
                <div className="font-mono text-xs tracking-widest uppercase text-muted-foreground">{p.name}</div>
                <div className="mt-3 flex items-end gap-1">
                  <div className="font-mono text-4xl font-semibold">{p.price}</div>
                  {p.sub && <div className="font-mono text-sm text-muted-foreground mb-1.5">{p.sub}</div>}
                </div>
                <p className="mt-2 text-sm text-muted-foreground font-light">{p.desc}</p>
                <ul className="mt-5 flex flex-col gap-2.5">
                  {p.items.map((it) => (
                    <li key={it} className="flex items-center gap-2.5 text-sm font-light">
                      <CheckCircle2 className="w-4 h-4 text-[var(--green)] shrink-0" />
                      {it}
                    </li>
                  ))}
                </ul>
                <a
                  href="#start"
                  className={`mt-7 inline-flex w-full justify-center items-center gap-2 font-mono text-xs tracking-wider uppercase px-4 py-3 rounded-sm transition ${p.featured
                      ? "bg-primary text-primary-foreground hover:opacity-90"
                      : "border border-border-bright hover:bg-bg-elev-1"
                    }`}
                >
                  {p.cta} <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="start" className="border-b border-border">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-24 text-center">
          <h2 className="text-4xl md:text-6xl font-semibold tracking-tight max-w-4xl mx-auto leading-[1.05]">
            Infrastructure that <span className="font-serif italic font-normal text-primary">won't quit</span>.
          </h2>
          <p className="mt-5 max-w-xl mx-auto text-muted-foreground font-light">
            Start free. Invite five friends. Run a vote tonight. The protocol is open, the keys are yours, and the treasury settles on Bitcoin.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#"
              className="inline-flex items-center gap-2 font-mono text-xs tracking-wider uppercase px-5 py-3 rounded-sm bg-primary text-primary-foreground hover:opacity-90 transition shadow-[var(--glow-primary)]"
            >
              Create my DAO <ArrowRight className="w-3.5 h-3.5" />
            </a>
            {/* <a
              href="#"
              className="inline-flex items-center gap-2 font-mono text-xs tracking-wider uppercase px-5 py-3 rounded-sm border border-border-bright hover:bg-bg-elev-1 transition"
            >
              <IconBrandGithub className="w-3.5 h-3.5" /> Read the spec
            </a> */}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-10">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 flex flex-wrap items-center justify-between gap-4 font-mono text-[11px] text-muted-foreground-2 tracking-wider uppercase">
          <div className="flex items-center gap-2 text-white">
            <Bitcoin className="w-3.5 h-3.5 text-primary" />
            bitmoot.xyz · 2026
          </div>
          <div>Built on Bitcoin · Coordinated on Nostr · By <a href='https://hexquarter.com' target="_blank" className="hover:text-white hover:underline. transition">HexQuarter</a></div>
        </div>
      </footer>
    </div>
  );
}
