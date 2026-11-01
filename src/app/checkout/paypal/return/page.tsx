import Link from "next/link";
import { redirect } from "next/navigation";

import { requireOperator } from "@/server/auth/require-operator";

const providerIdPattern = /^[A-Z0-9_-]{8,128}$/;

export const dynamic = "force-dynamic";

export default async function PayPalReturnPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const authorization = await requireOperator();
  if (!authorization.authorized) redirect("/login");
  const { token } = await searchParams;
  if (!token || !providerIdPattern.test(token)) redirect("/store?paypal=invalid-return");

  return (
    <main className="return-page">
      <section className="return-card">
        <span className="receipt-icon" aria-hidden="true">✓</span>
        <p className="eyebrow">Buyer approval returned</p>
        <h1>Approval received.<br />Capture is still separate.</h1>
        <p>RecoveryLoop will re-read the PayPal order before capture. Only a verified capture read-back is recorded as settled cash.</p>
        <form action={`/api/paypal/orders/${encodeURIComponent(token)}/capture`} method="post">
          <button className="button primary" type="submit">Capture $250.00 in sandbox</button>
        </form>
        <Link className="text-link" href="/store">Cancel and return to store</Link>
      </section>
    </main>
  );
}
