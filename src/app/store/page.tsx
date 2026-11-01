import { randomUUID } from "node:crypto";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { requireOperator } from "@/server/auth/require-operator";
import { buildStaticCart } from "@/server/modules/commerce/catalog";
import { formatMoney } from "@/shared/money";

export const dynamic = "force-dynamic";

export default async function StorePage({ searchParams }: { searchParams: Promise<{ paypal?: string }> }) {
  const [authorization, query] = await Promise.all([requireOperator(), searchParams]);
  const cart = buildStaticCart();
  const requestId = randomUUID();

  return (
    <AppShell active="/store">
      <header className="workspace-header store-header">
        <div><p className="eyebrow">Demo storefront</p><h1>Review your order</h1><p>A static S1 cart whose prices and total are calculated only on the server.</p></div>
        <div className="store-status">
          <span className="status-pill"><span className="pulse-dot" />USD only</span>
          {authorization.authorized ? <span className="operator-pill">Operator authorized</span> : null}
        </div>
      </header>
      <div className="store-grid">
        <section className="product-list" aria-label="Cart items">
          {cart.lines.map((line, index) => (
            <article className="product-card" key={line.item.sku}>
              <div className={`product-art ${line.item.accent}`} aria-hidden="true"><span>{index === 0 ? "◉" : "⌨"}</span></div>
              <div className="product-info"><span className="sku">{line.item.sku}</span><h2>{line.item.name}</h2><p>{line.item.description}</p><small>Quantity {line.quantity}</small></div>
              <strong className="product-price">{formatMoney(line.total)}</strong>
            </article>
          ))}
        </section>
        <aside className="order-summary">
          <p className="eyebrow">Server-priced summary</p><h2>Order total</h2>
          <div className="summary-lines">
            <span><small>Subtotal</small><strong>{formatMoney(cart.total)}</strong></span>
            <span><small>Shipping</small><strong>Included</strong></span>
            <span><small>Tax</small><strong>$0.00</strong></span>
          </div>
          <div className="grand-total"><span>Total</span><strong>{formatMoney(cart.total)}</strong></div>
          {query.paypal ? <p className="checkout-message" role="status">PayPal returned without a completed capture. No settled cash was recorded.</p> : null}
          {authorization.authorized ? (
            <>
              <form action="/api/paypal/orders" method="post">
                <input name="request_id" type="hidden" value={requestId} />
                <button className="button primary checkout-disabled" type="submit">Continue to PayPal sandbox</button>
              </form>
              <p className="summary-note">Creates a real sandbox order. Buyer approval and capture remain separate steps.</p>
              <form action="/auth/signout" method="post"><button className="text-button" type="submit">Sign out operator</button></form>
            </>
          ) : (
            <>
              <Link className="button primary checkout-disabled" href="/login">Operator sign in to checkout</Link>
              <p className="summary-note">Public visitors can inspect totals but cannot create or capture PayPal orders.</p>
            </>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
