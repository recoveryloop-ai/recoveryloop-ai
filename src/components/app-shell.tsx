import Link from "next/link";
import type { ReactNode } from "react";

const navigation = [
  { href: "/app", label: "Command", marker: "01" },
  { href: "/app/cases", label: "Cases", marker: "02" },
  { href: "/app/orders", label: "Orders", marker: "03" },
  { href: "/app/recovery", label: "Recovery map", marker: "04" },
  { href: "/app/actions", label: "Actions", marker: "05" },
  { href: "/app/demo", label: "Demo lab", marker: "06" },
] as const;

export function AppShell({ children, active }: { readonly children: ReactNode; readonly active: string }) {
  return (
    <div className="app-frame s7-shell">
      <aside className="sidebar s7-sidebar">
        <Link className="brand" href="/" aria-label="RecoveryLoop home">
          <span className="brand-mark" aria-hidden="true">R</span>
          <span><strong>RecoveryLoop</strong><small>Exception intelligence</small></span>
        </Link>
        <nav className="side-nav" aria-label="Primary navigation">
          <p className="eyebrow">Workspace</p>
          {navigation.map((item) => (
            <Link className={active === item.href ? "nav-link active" : "nav-link"} href={item.href} key={item.href}>
              <span>{item.marker}</span>{item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-note s7-side-note">
          <span className="pulse-dot" aria-hidden="true" />
          <div><strong>Sandbox control plane</strong><small>Canonical ledger protected</small></div>
        </div>
        <Link className="settings-link" href="/app/settings">Settings & safeguards →</Link>
      </aside>
      <main className="workspace s7-workspace">{children}</main>
    </div>
  );
}
