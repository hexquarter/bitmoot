import { FormEvent, useEffect, useState } from "react";
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
  ["01", "GOVERN", "Proposals & votes that just work", "Draft a proposal, attach a budget, and let the members sign the decision from Nostr.", "KIND 30052 · 8 / 12 VOTES · QUORUM 67%", ProposalImg, "NOSTR GOVERNANCE"],
  ["02", "CUSTODY", "A multisig your bank wishes it had", "Funds live in a Taproot multisig you control. M-of-N co-signers. Timelock recovery.", "TAPROOT VAULT · 3-OF-5 · 14 UTXOS", TreasuryImg, "BITCOIN TREASURY"],
  ["03", "PAY", "Payments in seconds", "Pay contributors in USDB by the second, send grants over Lightning, or settle on-chain.", "LIGHTNING · 120,000 SATS · SETTLED", PaymentImg, "PAYMENTS / USDB"],
  ["04", "COMMUNICATE", "Control your audience", "Publish signed updates to your own Nostr audience. Your identity and history stay portable.", "KIND 1 · 4 / 4 RELAYS · SIGNED BY DAO NPUB", FeedImg, "NOSTR FEED"],
];

function MarkIcon({ type }: { type: "audit" | "descriptor" | "builder" }) {
  return <span className={`mark-icon mark-icon--${type}`} aria-hidden="true" />;
}

export function Index() {
  const [block, setBlock] = useState(905421);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setBlock((value) => value + 1), 600000);
    return () => window.clearInterval(timer);
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("Request received. We will reply from a human address.");
    setEmail("");
  };

  return (
    <main className="public-site">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="BitMoot home">BIT<span>MOOT</span><b>.</b></a>
        <nav className="site-nav" aria-label="Main navigation"><a href="#use-cases">Use cases</a><a href="#stack">The stack</a><a href="#self-sovereign">Self-sovereign</a></nav>
        <a className="header-link" href="#start">OPEN A TREASURY <span>↗</span></a>
      </header>

      <section className="hero-shell" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><i /> BITCOIN-NATIVE DAO INFRASTRUCTURE</p>
          <h1 id="hero-title">Vote on Nostr.<br /><em>Custody</em> on Taproot.<br />Pay over Lightning.</h1>
          <p className="hero-summary">BitMoot is the operating layer for groups that govern together, hold their own keys, and move money without asking permission.</p>
          <div className="hero-actions"><a className="button-primary" href="#start">Start a DAO <span>↗</span></a><a className="quiet-link" href="#proof">View a live DAO <span>→</span></a></div>
          <div className="trust-strip" aria-label="Trust signals"><a href="#proof"><MarkIcon type="audit" /> AUDIT LOG <span>verified</span></a><a href="#proof"><MarkIcon type="descriptor" /> DESCRIPTOR <span>bc1p…7k4q</span></a><a href="#proof"><MarkIcon type="builder" /> BUILT BY <span>BitMoot core</span></a></div>
        </div>

        <div className="live-panel" aria-label="Live DAO demonstration">
          <div className="panel-topline"><span><i className="status-dot" /> LIVE DEMO</span><span>NOT A RENDER</span></div>
          <div className="panel-heading"><div><span className="data-label">TREASURY / STUDIO HALFTONE</span><strong>₿ 2.847</strong><small>≈ $189,420.51 USD</small></div><span className="settled">SETTLED</span></div>
          <div className="panel-metrics"><div><strong>3 / 5</strong><span>SIGNATURES</span></div><div><strong>12</strong><span>MEMBERS</span></div><div><strong>042</strong><span>PROPOSAL</span></div></div>
          <div className="proposal-row"><div className="proposal-index">042</div><div className="proposal-body"><span>Q2 video grants</span><small>NOSTR EVENT · KIND 37000</small><div className="vote-track"><b /><b /><b /><i /><i /></div></div><span className="vote-status">VOTING</span></div>
          <div className="panel-log"><div><span className="log-mark">↳</span><span>taproot / key-path spend</span><b>3 of 5 signed</b></div><div><span className="log-mark log-mark--nostr">◎</span><span>wss://relay.bitmoot.xyz</span><b>connected</b></div></div>
          <div className="panel-footer"><span>BLOCK <b>{block.toLocaleString()}</b></span><span>LAST EVENT <b>12s ago</b></span></div>
        </div>
        <div className="annotation">← real state, not a promise</div>
      </section>

      <section className="stats-band" aria-label="BitMoot facts"><div><strong>$0</strong><span>TO LAUNCH</span></div><div><strong>100%</strong><span>SELF-CUSTODY</span></div><div><strong>21M</strong><span>CAP FOREVER</span></div><div><strong>01</strong><span>STACK, END TO END</span></div></section>

      <section className="index-section" id="use-cases" aria-labelledby="use-cases-title">
        <div className="section-marker">01 / WHO IT IS FOR</div>
        <div className="section-intro"><h2 id="use-cases-title">The treasury is the product.</h2><p>Different groups. Same hard requirement: the people who decide should be the people who can verify and sign.</p></div>
        <div className="use-case-list">{useCases.map(([number, label, copy, example]) => <a className="use-case-row" href="#proof" key={number}><span className="row-number">{number}</span><span className="row-label">{label}</span><span className="row-copy">{copy}</span><span className="row-example">{example}<b>↗</b></span></a>)}</div>
      </section>

      <section className="stack-section" id="stack" aria-labelledby="stack-title">
        <div className="stack-intro"><div className="section-marker">02 / ONE STACK</div><h2 id="stack-title">Govern, pay and communicate over your Bitcoin organization.</h2><p>Four surfaces. One source of truth. Every preview below is an actual part of the app, connected to the same keys and treasury.</p></div>
        <div className="product-pipeline">{productPreviews.map(([number, label, title, copy, meta, image, imageLabel], index) => <article className={`product-preview product-preview--${index + 1}`} key={number}><div className="preview-copy"><span className="preview-number">{number}</span><div><div className="preview-label">{label}</div><h3>{title}</h3><p>{copy}</p><div className="preview-meta">{meta}</div></div></div><div className="preview-frame"><div className="preview-frame-head"><span>{imageLabel}</span><span>BITMOOT / LIVE VIEW</span></div><img src={image} alt={`${title} preview from the BitMoot app`} /></div></article>)}</div>
      </section>

      <section id="self-sovereign" className="sovereignty-section" aria-labelledby="sovereignty-title"><div className="sovereignty-heading"><div className="section-marker">04 / SELF-SOVEREIGNTY</div><h2 id="sovereignty-title">The rules stay visible.</h2><p>Self-custody is not a slogan in the interface. It is a set of inspectable choices.</p></div><div className="sovereignty-list"><article><b>01</b><div><h3>You hold the keys.</h3><p>Funds live in a multisig you control. We cannot pause, freeze, or rug you. Timelock recovery covers the missing signer.</p><code>RECOVERY / CSV 30 DAYS</code></div></article><article><b>02</b><div><h3>Stablecoin payroll is optional.</h3><p>Pay contributors in USDB so a bad week in the market does not become their problem. Volatility stays optional.</p><code>USDB / STREAMING / LIGHTNING</code></div></article><article><b>03</b><div><h3>Identity travels with the member.</h3><p>Members log in once and carry their reputation across Nostr-native apps. Your community is never locked in.</p><code>NOSTR NPUB / KIND 1 / PORTABLE</code></div></article></div></section>

      <section className="signup-section" id="start" aria-labelledby="signup-title"><div><div className="section-marker">05 / ACCESS</div><h2 id="signup-title">Bring a group.<br /><em>Keep the keys.</em></h2></div><form onSubmit={handleSubmit}><label htmlFor="email">EMAIL ADDRESS</label><div><input id="email" name="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@yourcollective.org" /><button type="submit">REQUEST ACCESS <span>↗</span></button></div><p>Your address is used for access updates only. No newsletter machinery.</p>{status && <output>{status}</output>}</form></section>
      <footer className="site-footer"><span>BITMOOT / 2026</span><span>PROOF, NOT PROMISES.</span><span>21M FOREVER.</span></footer>
    </main>
  );
}