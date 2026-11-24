import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ProposalImg from "../assets/proposals.png";
import TreasuryImg from "../assets/treasury.png";
import PaymentImg from "../assets/payments.png";
import FeedImg from "../assets/feed.png";

const useCases = [
  ["01", "CREATOR COLLECTIVES", "Pool revenue. Vote on releases. Pay contributors without an admin in the middle.", "Studio Halftone · 12 members · 3-of-5"],
  ["02", "INVESTMENT CLUBS", "Make the treasury visible, the decision public, and the disbursement signed by the people who own it.", "Northstar Club · 5 signers · 0 custodians"],
  ["03", "OPEN-SOURCE GUILDS", "Fund proposals and stream USDB to the people doing the work. Identity stays portable on Nostr.", "Otterhash · 28 contributors · 14 active streams"],
  ["04", "LOCAL COMMUNITIES", "Collect dues, publish the ledger, and decide together. The rules are visible before the money moves.", "Common Ground · 41 members · 21 proposals"],
];

const productPreviews = [
  ["01", "GOVERN", "Proposals & votes that just work", "Draft a proposal, attach a budget, and let members vote privately — every proposal and vote is end-to-end encrypted to the organization's members. Even the org's own rules change by vote: thresholds, signers, members, permissions.", "NIP-44 E2E · KIND 37000 · GOVERNANCE BY VOTE", ProposalImg, "NOSTR GOVERNANCE"],
  ["02", "CUSTODY", "A treasury with two tiers", "A capped operational wallet for daily spending, and a Taproot M-of-N reserve for storage. Excess sweeps to cold storage; every reserve movement is co-signed by the council.", "HOT + COLD · TAPROOT M-OF-N · SIGNED SWEEPS", TreasuryImg, "BITCOIN TREASURY"],
  ["03", "PAY", "Payments in seconds", "Pay contributors instantly over Lightning or USDB, within a cap your council sets. Larger amounts settle through the multisig — always against a passed proposal.", "LIGHTNING · USDB · CAPPED HOT WALLET", PaymentImg, "PAYMENTS / USDB"],
  ["04", "COMMUNICATE", "An audience you control", "Publish signed updates to your own Nostr feed. Decide who may post, and keep your identity and history portable — outsiders can shout at relays, your org only hears members.", "KIND 1 · MEMBER-SIGNED · FORGERY-PROOF", FeedImg, "NOSTR FEED"],
];

/** Shared micro-label style: 10px IBM Plex Mono, uppercase, wide tracking. */
const label = "font-mono text-[10px] uppercase tracking-[.12em]";
const label11 = "font-mono text-[10px] uppercase tracking-[.11em]";
const label9 = "font-mono text-[9px] uppercase tracking-[.12em]";
const labelMuted = `${label} text-ink-low`;
const heading = "font-medium leading-[0.98] tracking-[-0.045em]";
const sectionTitle = `text-[clamp(2.3rem,5vw,4.7rem)] ${heading}`;
const sectionPad = "border-b border-rule px-[clamp(20px,9vw,140px)] py-[clamp(70px,10vw,140px)]";

const markIconStyles: Record<"audit" | "descriptor" | "builder" | "privacy", string> = {
  audit:
    "rounded-full border-stable after:absolute after:left-[3px] after:top-[1px] after:h-[5px] after:w-[3px] after:rotate-45 after:border-b after:border-r after:border-stable after:content-['']",
  descriptor:
    "border-pending after:absolute after:left-[2px] after:top-[5px] after:h-px after:w-[7px] after:bg-pending after:content-['']",
  builder: "rounded-full border-nostr",
  privacy:
    "rounded-[2px] border-stable after:absolute after:left-[3px] after:top-[2px] after:h-1 after:w-1 after:bg-stable after:content-['']",
};

function MarkIcon({ type }: { type: "audit" | "descriptor" | "builder" | "privacy" }) {
  return (
    <span
      aria-hidden
      className={`relative top-[2px] mr-[5px] inline-block h-3 w-3 border border-current ${markIconStyles[type]}`}
    />
  );
}

const buttonPrimary =
  "inline-block bg-sats px-4 py-3 font-mono text-[11px] uppercase tracking-[.08em] text-bg-void hover:translate-x-[1px] hover:translate-y-[-1px] hover:bg-[#ffad45]";
const quietLink = "font-mono text-[11px] uppercase text-ink-mid hover:text-ink-hi";

export function Index() {
  const [block, setBlock] = useState(905421);

  useEffect(() => {
    const timer = window.setInterval(() => setBlock((value) => value + 1), 600000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    /* Links inherit their color and get the 160ms color/border/transform transitions. */
    <main className="min-h-screen overflow-hidden bg-bg-void font-display text-[16px] leading-[1.6] text-ink-hi [&_a]:text-inherit [&_a]:no-underline [&_a]:transition-[color,border-color,transform,background-color] [&_a]:duration-150 [&_a]:motion-reduce:transition-none [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-2 [&_a:focus-visible]:outline-ink-hi">
      <header className="flex h-[68px] items-center justify-between border-b border-rule px-[clamp(20px,5vw,72px)]">
        <a className="font-mono text-[15px] font-semibold tracking-[.14em]" href="/" aria-label="BitMoot home">
          BIT<span className="font-light">MOOT</span>
          <b className="font-medium text-sats">.</b>
        </a>
        <nav className={`ml-auto mr-[clamp(24px,5vw,76px)] flex gap-[30px] ${label} max-[800px]:hidden`} aria-label="Main navigation">
          <a className="text-ink-mid hover:text-ink-hi" href="#use-cases">Use cases</a>
          <a className="text-ink-mid hover:text-ink-hi" href="#stack">The stack</a>
          <a className="text-ink-mid hover:text-ink-hi" href="#self-sovereign">Self-sovereign</a>
        </nav>
        <Link className={`${label} border-l border-rule-strong pl-6 text-ink-mid hover:text-ink-hi`} to="/auth">
          REGISTER YOUR DAO <span className="ml-[7px] text-sats">↗</span>
        </Link>
      </header>

      <section
        aria-labelledby="hero-title"
        className="relative grid min-h-[650px] grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] gap-[clamp(32px,8vw,130px)] border-b border-rule px-[clamp(20px,5vw,72px)] pt-[clamp(64px,9vw,132px)] pb-[60px] before:absolute before:right-0 before:top-0 before:h-[150px] before:w-[150px] before:bg-[image:radial-gradient(var(--rule)_1px,transparent_1px)] before:bg-[length:18px_18px] before:opacity-45 before:content-[''] max-[800px]:block max-[800px]:pt-[70px]"
      >
        <div className="relative z-[1] max-w-[760px] self-center">
          <p className={`mb-[27px] text-sats ${label}`}>
            <i className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-sats" /> BITCOIN-NATIVE DAO INFRASTRUCTURE
          </p>
          <h1 id="hero-title" className={`max-w-[790px] text-[clamp(2.7rem,6.1vw,5.7rem)] ${heading}`}>
            Vote on Nostr.<br />
            <em className="font-serif text-sats">Custody</em> on Taproot.<br />
            Pay over Lightning.
          </h1>
          <p className="my-7 max-w-[48ch] text-[17px] leading-[1.6] text-ink-mid">
            BitMoot is the operating layer for groups that govern together, hold their own keys, and move money without
            asking permission. Proposals and votes stay end-to-end encrypted for maximum privacy. Free to use — a small
            1% fee on each validated payment keeps the lights on.
          </p>
          <div className="flex items-center gap-[25px]">
            <Link className={buttonPrimary} to="/auth">Register your DAO <span className="ml-[7px] text-sats">↗</span></Link>
            <a className={quietLink} href="#proof">View a live DAO <span className="ml-[5px] text-sats">→</span></a>
          </div>
          <div className={`mt-[62px] flex flex-wrap gap-x-[25px] gap-y-3.5 border-t border-rule pt-3.5 ${label}`}>
            <a className="text-ink-mid hover:text-ink-hi" href="#proof"><MarkIcon type="audit" /> AUDIT LOG <span className="ml-[5px] text-ink-low">verified</span></a>
            <a className="text-ink-mid hover:text-ink-hi" href="#proof"><MarkIcon type="descriptor" /> DESCRIPTOR <span className="ml-[5px] text-ink-low">bc1p…7k4q</span></a>
            <a className="text-ink-mid hover:text-ink-hi" href="#self-sovereign"><MarkIcon type="privacy" /> E2E ENCRYPTED <span className="ml-[5px] text-ink-low">proposals + votes</span></a>
            <a className="text-ink-mid hover:text-ink-hi" href="#start"><MarkIcon type="builder" /> PRICING <span className="ml-[5px] text-ink-low">free · 1% per payment</span></a>
            <a className="text-ink-mid hover:text-ink-hi" href="https://hexquarter.com" target="_blank"><MarkIcon type="builder" /> BUILT BY <span className="ml-[5px] text-ink-low">HexQuarter</span></a>
          </div>
        </div>

        <div
          aria-label="Live DAO demonstration"
          className="relative z-[1] max-w-[530px] min-w-0 self-center border border-rule-strong bg-bg-panel font-mono after:absolute after:right-[-5px] after:top-[-5px] after:h-[9px] after:w-[9px] after:border-r after:border-t after:border-sats after:content-[''] max-[800px]:mt-[60px]"
        >
          <div className={`flex justify-between border-b border-rule px-4 py-3 ${labelMuted}`}>
            <span><i className="mr-[5px] inline-block h-1.5 w-1.5 rounded-full bg-stable" /> LIVE DEMO</span>
            <span>NOT A RENDER</span>
          </div>
          <div className="flex items-start justify-between px-5 pt-[27px] pb-5">
            <div>
              <span className={`mb-[9px] block ${label9}`}>TREASURY / STUDIO HALFTONE</span>
              <strong className="block text-[30px] font-normal leading-none">₿ 2.847</strong>
              <small className="mt-1.5 block text-[11px] text-ink-mid">≈ $189,420.51 USD</small>
            </div>
            <span className="text-[10px] tracking-[.08em] text-stable">SETTLED</span>
          </div>
          <div className="grid grid-cols-3 border-b border-t border-rule">
            <div className="border-r border-rule px-4 py-[13px] last:border-r-0">
              <strong className="block text-[17px] font-normal">3 / 5</strong>
              <span className="text-[8px] uppercase tracking-[.12em] text-ink-low">SIGNATURES</span>
            </div>
            <div className="border-r border-rule px-4 py-[13px] last:border-r-0">
              <strong className="block text-[17px] font-normal">12</strong>
              <span className="text-[8px] uppercase tracking-[.12em] text-ink-low">MEMBERS</span>
            </div>
            <div className="border-r border-rule px-4 py-[13px] last:border-r-0">
              <strong className="block text-[17px] font-normal">042</strong>
              <span className="text-[8px] uppercase tracking-[.12em] text-ink-low">PROPOSAL</span>
            </div>
          </div>
          <div className="m-5 flex items-center gap-[13px] py-[15px]">
            <div className="text-sm text-sats">042</div>
            <div className="min-w-0 flex-1">
              <span className="block">Q2 video grants</span>
              <small className="mt-[3px] block text-[9px] text-ink-low">NOSTR EVENT · KIND 37000</small>
              <div className="mt-3 flex gap-[3px]">
                <b className="block h-[3px] w-[25px] bg-sats" /><b className="block h-[3px] w-[25px] bg-sats" /><b className="block h-[3px] w-[25px] bg-sats" /><i className="block h-[3px] w-[25px] bg-rule-strong" /><i className="block h-[3px] w-[25px] bg-rule-strong" />
              </div>
            </div>
            <span className="text-[10px] tracking-[.08em] text-pending">VOTING</span>
          </div>
          <div className="border-t border-rule px-5 py-2">
            <div className="flex items-center gap-2 py-[7px] text-[10px] text-ink-mid">
              <span className="text-[17px] text-sats">↳</span>
              <span>taproot / key-path spend</span>
              <b className="ml-auto font-normal text-stable">3 of 5 signed</b>
            </div>
            <div className="flex items-center gap-2 py-[7px] text-[10px] text-ink-mid">
              <span className="text-[17px] text-nostr">◎</span>
              <span>wss://relay.bitmoot.xyz</span>
              <b className="ml-auto font-normal text-stable">connected</b>
            </div>
          </div>
          <div className={`flex justify-between border-t border-rule px-4 py-3 ${label9}`}>
            <span>BLOCK <b className="font-normal text-ink-hi">{block.toLocaleString()}</b></span>
            <span>LAST EVENT <b className="font-normal text-ink-hi">12s ago</b></span>
          </div>
        </div>
        <div className="absolute bottom-[35px] left-[calc(50%+40px)] rotate-[-4deg] font-mono text-[10px] text-ink-low max-[800px]:bottom-6 max-[800px]:left-auto max-[800px]:right-6">
          ← real state, not a promise
        </div>
      </section>

      <section aria-label="BitMoot facts" className="grid grid-cols-4 border-b border-rule px-[clamp(20px,5vw,72px)] max-[800px]:grid-cols-2">
        <div className="border-r border-rule py-[22px] pr-[25px] last:border-r-0 [&:nth-child(n+2)]:pl-[25px] max-[800px]:[&:nth-child(2)]:border-r-0 max-[800px]:[&:nth-child(n+3)]:border-t max-[800px]:[&:nth-child(3)]:pl-0 max-[800px]:[&:nth-child(4)]:pl-[25px]">
          <strong className="block font-mono text-[23px] font-normal">FREE</strong>
          <span className="font-mono text-[9px] tracking-[.1em] text-ink-low">TO USE, NO SUBSCRIPTION</span>
        </div>
        <div className="border-r border-rule py-[22px] pr-[25px] last:border-r-0 [&:nth-child(n+2)]:pl-[25px] max-[800px]:[&:nth-child(2)]:border-r-0 max-[800px]:[&:nth-child(n+3)]:border-t max-[800px]:[&:nth-child(3)]:pl-0 max-[800px]:[&:nth-child(4)]:pl-[25px]">
          <strong className="block font-mono text-[23px] font-normal">1%</strong>
          <span className="font-mono text-[9px] tracking-[.1em] text-ink-low">PER VALIDATED PAYMENT</span>
        </div>
        <div className="border-r border-rule py-[22px] pr-[25px] last:border-r-0 [&:nth-child(n+2)]:pl-[25px] max-[800px]:[&:nth-child(2)]:border-r-0 max-[800px]:[&:nth-child(n+3)]:border-t max-[800px]:[&:nth-child(3)]:pl-0 max-[800px]:[&:nth-child(4)]:pl-[25px]">
          <strong className="block font-mono text-[23px] font-normal">100%</strong>
          <span className="font-mono text-[9px] tracking-[.1em] text-ink-low">SELF-CUSTODY</span>
        </div>
        <div className="border-r border-rule py-[22px] pr-[25px] last:border-r-0 [&:nth-child(n+2)]:pl-[25px] max-[800px]:[&:nth-child(2)]:border-r-0 max-[800px]:[&:nth-child(n+3)]:border-t max-[800px]:[&:nth-child(3)]:pl-0 max-[800px]:[&:nth-child(4)]:pl-[25px]">
          <strong className="block font-mono text-[23px] font-normal">01</strong>
          <span className="font-mono text-[9px] tracking-[.1em] text-ink-low">STACK, END TO END</span>
        </div>
      </section>

      <section className={sectionPad} id="use-cases" aria-labelledby="use-cases-title">
        <div className={`text-sats ${label}`}>01 / WHO IT IS FOR</div>
        <div className="mt-8 mb-[62px] grid max-w-[900px] grid-cols-2 gap-8 max-[800px]:block">
          <h2 id="use-cases-title" className={sectionTitle}>The treasury is the product.</h2>
          <p className="max-w-[37ch] text-[17px] text-ink-mid max-[800px]:mt-[25px]">
            Different groups. Same hard requirement: the people who decide should be the people who can verify and sign.
          </p>
        </div>
        <div className="ml-[8vw] border-t border-rule max-[800px]:ml-0">
          {useCases.map(([number, rowLabel, copy, example]) => (
            <a
              className="grid min-h-[106px] grid-cols-[45px_1.15fr_1.7fr_1.2fr] items-center gap-[22px] border-b border-rule py-[15px] hover:translate-x-1 hover:border-rule-strong max-[800px]:block max-[800px]:items-start max-[800px]:py-[21px]"
              href="#proof"
              key={number}
            >
              <span className="font-mono text-[10px] text-sats">{number}</span>
              <span className="font-mono text-[10px] text-ink-mid max-[800px]:mt-[5px]">{rowLabel}</span>
              <span className="max-w-[34ch] max-[800px]:mt-[5px]">{copy}</span>
              <span className="font-mono text-[10px] text-ink-low max-[800px]:mt-[13px]">
                {example}
                <b className="float-right font-normal text-sats">↗</b>
              </span>
            </a>
          ))}
        </div>
      </section>

      <section className={sectionPad} id="stack" aria-labelledby="stack-title">
        <div className="mb-[70px] grid max-w-[1000px] grid-cols-2 gap-x-[70px] gap-y-6 max-[800px]:block">
          <div className={`col-span-full text-sats ${label}`}>02 / ONE STACK</div>
          <h2 id="stack-title" className={sectionTitle}>Govern, pay and communicate over your Bitcoin organization.</h2>
          <p className="max-w-[38ch] self-end text-[17px] text-ink-mid max-[800px]:mt-[25px]">
            Four surfaces. One source of truth. Every preview below is an actual part of the app, connected to the same
            keys and treasury.
          </p>
        </div>
        <div className="border-t border-rule">
          {productPreviews.map(([number, previewLabel, title, copy, meta, image, imageLabel], index) => {
            const even = index % 2 === 1;
            return (
              <article
                className="group grid grid-cols-[minmax(240px,0.75fr)_minmax(0,1.25fr)] gap-[clamp(30px,7vw,120px)] border-b border-rule pt-9 pb-[50px] max-[800px]:block"
                key={number}
              >
                <div className={`flex gap-[22px] pt-[11px] ${even ? "col-start-2 row-start-1" : ""}`}>
                  <span className="font-mono text-[11px] text-sats">{number}</span>
                  <div>
                    <div className={`text-ink-low ${label11}`}>{previewLabel}</div>
                    <h3 className="mt-[15px] mb-4 max-w-[12ch] text-[clamp(1.7rem,3vw,2.7rem)] font-medium leading-none tracking-[-0.04em]">{title}</h3>
                    <p className="max-w-[37ch] text-[15px] leading-[1.6] text-ink-mid">{copy}</p>
                    <div className={`mt-[27px] border-t border-rule pt-[13px] text-sats ${label11}`}>{meta}</div>
                  </div>
                </div>
                <div
                  className={`border border-rule-strong bg-bg-inset p-[13px] transition-[border-color,transform] duration-150 group-hover:translate-x-[2px] group-hover:translate-y-4 group-hover:border-sats motion-reduce:transition-none motion-reduce:group-hover:transform-none max-[800px]:mt-[35px] max-[800px]:translate-y-0 max-[800px]:group-hover:translate-x-0 max-[800px]:group-hover:translate-y-0 ${
                    even ? "col-start-1 row-start-1" : "translate-y-[18px]"
                  }`}
                >
                  <div className={`mb-3 flex justify-between text-ink-low ${label11}`}>
                    <span>{imageLabel}</span>
                    <span>BITMOOT / LIVE VIEW</span>
                  </div>
                  <img className="block max-w-full border border-rule grayscale contrast-[1.05]" src={image} alt={`${title} preview from the BitMoot app`} />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section
        className="grid grid-cols-[0.8fr_1.2fr] gap-[clamp(45px,10vw,160px)] border-b border-rule px-[clamp(20px,9vw,140px)] py-[clamp(70px,10vw,140px)] max-[800px]:block"
        id="self-sovereign"
        aria-labelledby="sovereignty-title"
      >
        <div className="sticky top-[100px] self-start max-[800px]:static">
          <div className={`text-sats ${label}`}>04 / SELF-SOVEREIGNTY</div>
          <h2 id="sovereignty-title" className={`my-[26px] ${sectionTitle}`}>The rules stay visible.</h2>
          <p className="max-w-[31ch] text-[17px] text-ink-mid">Self-custody is not a slogan in the interface. It is a set of inspectable choices.</p>
        </div>
        <div className="border-t border-rule max-[800px]:mt-[50px]">
          {[
            ["01", "You hold the keys.", "Funds live in a multisig you control. We cannot pause, freeze, or rug you. An operational wallet handles daily spending under a cap your council sets — everything else sleeps in cold storage.", "RECOVERY / CSV 30 DAYS"],
            ["02", "Private by design.", "Proposal details and votes are end-to-end encrypted to the organization's members with NIP-44. Every org event is pinned to a member key — outsiders can shout at relays, your organization only hears its members.", "NIP-44 / E2E / MEMBER KEYS ONLY"],
            ["03", "Stablecoin payroll is optional.", "Pay contributors in USDB so a bad week in the market does not become their problem. Volatility stays optional.", "USDB / STREAMING / LIGHTNING"],
            ["04", "Identity travels with the member.", "Members log in once and carry their reputation across Nostr-native apps. Your community is never locked in.", "NOSTR NPUB / KIND 1 / PORTABLE"],
            ["05", "A leak does not sink the ship.", "Rotate the wallet seed without losing your npub, proposals or feed history. The reserve vault never depended on it — and your records stay exactly where you left them.", "ROTATION / HISTORY PRESERVED"],
          ].map(([number, title, copy, code]) => (
            <article className="grid grid-cols-[40px_1fr] gap-7 border-b border-rule py-[30px]" key={number}>
              <b className="font-normal font-mono text-[11px] text-sats">{number}</b>
              <div>
                <h3 className="mb-[9px] text-[22px] font-medium">{title}</h3>
                <p className="m-0 max-w-[52ch] text-base text-ink-mid">{copy}</p>
                <code className="mt-[18px] block font-mono text-[10px] text-ink-low">{code}</code>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={`grid grid-cols-2 items-start gap-[50px] ${sectionPad} max-[800px]:block`} id="start" aria-labelledby="signup-title">
        <div>
          <div className={`text-sats ${label}`}>05 / ACCESS</div>
          <h2 id="signup-title" className={sectionTitle}>
            Bring a group.<br />
            <em className="font-serif text-sats">Keep the keys.</em>
          </h2>
          <p className="mt-[26px] max-w-[34ch] text-[17px] leading-[1.6] text-ink-mid">
            Free to use — a small 1% fee is taken on each validated payment. No subscriptions, no custody, no seats to
            count.
          </p>
        </div>
        <div className="grid max-w-[540px] justify-items-start gap-[18px] pt-[23px] max-[800px]:pt-[45px]">
          <Link className={`${buttonPrimary} px-5 py-3.5 text-xs`} to="/auth">REGISTER YOUR DAO <span className="ml-[7px] text-sats">↗</span></Link>
          <a className={quietLink} href="/auth">Got an invite npub? Join with it <span className="ml-[5px] text-sats">→</span></a>
          <ul className="mt-2 grid gap-2.5 border-t border-rule pt-[18px] font-mono text-[10px] uppercase tracking-[.1em] text-ink-low">
            <li>NO EMAIL, NO WAITLIST — YOUR NOSTR KEY IS THE ACCOUNT</li>
            <li>PASSKEY, NSEC OR EXTENSION — KEYS NEVER LEAVE THE DEVICE</li>
            <li>OPERATIONAL WALLET + M-OF-N RESERVE FROM DAY ONE</li>
            <li>GOVERNANCE BY VOTE — EVEN THE ORG'S OWN RULES</li>
          </ul>
        </div>
      </section>
      <footer className={`flex justify-between px-[clamp(20px,5vw,72px)] py-[22px] ${labelMuted} max-[800px]:flex-wrap max-[800px]:gap-3`}>
        <span>BITMOOT / 2026</span>
        <span>PROOF, NOT PROMISES.</span>
        <span>21M FOREVER.</span>
      </footer>
    </main>
  );
}
