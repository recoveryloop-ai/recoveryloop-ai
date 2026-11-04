import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="landing">
      <nav className="landing-nav">
        <div className="brand"><span className="brand-mark">R</span><span><strong>RecoveryLoop</strong><small>Exception intelligence</small></span></div>
        <span className="status-pill"><span className="pulse-dot" />Public sandbox demo</span>
      </nav>
      <section className="hero">
        <p className="eyebrow">Recovery operations, made accountable</p>
        <h1>See the whole order.<br /><em>Recover with certainty.</em></h1>
        <p className="hero-copy">RecoveryLoop turns fragmented payment, fulfillment, and policy signals into a traceable customer obligation—before anyone moves money.</p>
        <div className="hero-actions">
          <Link className="button primary" href="/app">Explore live demo <span>↗</span></Link>
          <Link className="button secondary" href="/store">View demo order</Link>
        </div>
        <div className="proof-row" aria-label="Foundation capabilities">
          <div><strong>05</strong><span>Seeded scenarios</span></div>
          <div><strong>100%</strong><span>Integer money math</span></div>
          <div><strong>0</strong><span>Public money actions</span></div>
        </div>
      </section>
      <div className="hero-orbit" aria-hidden="true"><span /><span /><span /></div>
    </main>
  );
}
