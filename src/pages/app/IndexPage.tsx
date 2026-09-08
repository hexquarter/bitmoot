import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const proposals = [
  ["PROP-014", "Q3 grant: Nostr client localization", "VOTING", "67%", "2d left", "pending"],
  ["PROP-013", "Approve $4,200 to Lina / mixing studio", "VOTING", "92%", "12h left", "pending"],
  ["PROP-012", "Add Marc as 5th signer", "QUEUED", "100%", "3 / 5 signed", "stable"],
  ["PROP-011", "Migrate treasury to Taproot vault", "SETTLED", "100%", "BLOCK 901,201", "stable"],
];

const activity = [
  ["12:04:21", "PROP-013", "Marc signed yes", "kind:30052 · npub1f7s…3dp1", "stable"],
  ["11:48:03", "LN-PAY", "120,000 sats → @lina", "preimage 4f7a… · settled", "sats"],
  ["10:22:16", "PROP-014", "Quorum reached", "67% · 8 of 12 members", "pending"],
  ["09:01:42", "NOSTR", "Event relayed", "wss://relay.bitmoot.xyz", "nostr"],
];

export function AppIndexPage() {
  const [block, setBlock] = useState(901442);
  useEffect(() => {
    const timer = window.setInterval(() => setBlock((value) => value + 1), 600000);
    return () => window.clearInterval(timer);
  }, []);

  return <div className="dashboard">
    <div className="page-heading"><div><div className="portal-kicker">PLEBS LABEL / DASHBOARD</div><h1>Control room</h1><p>One view of the money, the votes, and the machine carrying both.</p></div><div className="system-state"><i /> ALL SYSTEMS NOMINAL<br /><small>LAST CHECK 12 SEC AGO</small></div></div>

    <section className="dashboard-hero" aria-label="Treasury overview">
      <div className="balance-readout"><div className="portal-kicker">TREASURY BALANCE / SELF-CUSTODY</div><strong>₿ 2.847</strong><span>≈ $189,420.51 USD</span><div className="balance-meta"><span>3-OF-5 TAPROOT MULTISIG</span><span>14 UTXOS</span><span>4 SAT/VB</span></div></div>
      <div className="signer-readout"><div className="portal-kicker">SIGNING QUORUM</div><strong>3 <em>/</em> 5</strong><div className="signer-track"><b /><b /><b /><i /><i /></div><span>PROP-012 / ADD MARC AS 5TH SIGNER</span><Link to="/app/treasury">OPEN VAULT →</Link></div>
      <div className="block-readout"><div className="portal-kicker">NETWORK STATE</div><strong>{block.toLocaleString()}</strong><span>BLOCK HEIGHT</span><div className="network-line"><i /> BITCOIN MAINNET <b>42ms</b></div></div>
    </section>

    <section className="dashboard-grid">
      <div className="console-section proposal-console"><div className="console-heading"><div><div className="portal-kicker">GOVERNANCE / OPEN ITEMS</div><h2>Proposal queue</h2></div><Link to="/app/proposals">VIEW ALL →</Link></div><div className="proposal-table"><div className="table-head"><span>ID</span><span>PROPOSAL</span><span>QUORUM</span><span>STATE</span></div>{proposals.map(([id, title, state, quorum, time, tone]) => <Link to="/app/proposals" className="proposal-item" key={id}><span className="proposal-id">{id}</span><span><strong>{title}</strong><small>{time}</small></span><span className="quorum"><i style={{ width: quorum }} /><small>{quorum}</small></span><b className={`state-${tone}`}>{state}</b></Link>)}</div></div>
      <aside className="console-section artifact-console"><div className="portal-kicker">VERIFIABLE ARTIFACT</div><h2>Descriptor</h2><p>Anyone with the output descriptor can independently reconstruct the policy.</p><code>wsh(sortedmulti(3,<br />[a1b2c3d4/48h/0h/0h/2h]...))</code><div className="artifact-details"><span>ADDRESS</span><b>bc1pq8x4n3v…0fk9d2</b><span>LAST SPEND</span><b>BLOCK 901,201</b><span>RECOVERY</span><b>TIMELOCK / 30 DAYS</b></div><Link to="/app/settings">VIEW POLICY →</Link></aside>
    </section>

    <section className="console-section activity-console"><div className="console-heading"><div><div className="portal-kicker">EVENT STREAM</div><h2>Recent activity</h2></div><span className="relay-state"><i /> 4 / 4 RELAYS ONLINE</span></div><div className="activity-table">{activity.map(([time, event, title, detail, tone]) => <div className="activity-item" key={time + event}><time>{time}</time><b className={`event-${tone}`}>{event}</b><strong>{title}</strong><span>{detail}</span></div>)}</div></section>
  </div>;
}