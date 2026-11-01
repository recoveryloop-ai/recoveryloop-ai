import Link from "next/link";

import { loginAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="login-page">
      <section className="login-card">
        <Link className="brand" href="/"><span className="brand-mark">R</span><span><strong>RecoveryLoop</strong><small>Protected operator access</small></span></Link>
        <div className="login-copy"><p className="eyebrow">Sandbox control plane</p><h1>Operator sign in</h1><p>Only the allowlisted Supabase operator can create or capture PayPal sandbox orders.</p></div>
        {error ? <p className="form-error" role="alert">Sign-in failed. Check the operator credentials and role.</p> : null}
        <form action={loginAction} className="login-form">
          <label htmlFor="email">Operator email</label>
          <input id="email" name="email" type="email" autoComplete="username" required />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" minLength={12} required />
          <button className="button primary" type="submit">Sign in securely</button>
        </form>
        <p className="login-note">Credentials are sent only to the RecoveryLoop server and Supabase Auth. They are never stored in browser code.</p>
      </section>
      <aside className="login-aside" aria-label="Security controls">
        <p className="eyebrow">Three checks before payment</p>
        <h2>Identity.<br />Role.<br /><em>Merchant scope.</em></h2>
        <p>Every checkout route repeats authorization server-side. The public workspace has no PayPal mutation control.</p>
      </aside>
    </main>
  );
}
