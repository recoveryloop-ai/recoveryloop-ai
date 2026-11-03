import Link from "next/link";
import type { ReactNode } from "react";

const navigation = [
  { href: "/app", label: "Command center", marker: "01" },
  { href: "/store", label: "Demo store", marker: "02" },
] as const;

export function AppShell({ children, active }: { readonly children: ReactNode; readonly active: string }) {
  return (
    <div className="app-frame">
      <aside className="sidebar">
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
        <div className="sidebar-note">
          <span className="pulse-dot" aria-hidden="true" />
          <div><strong>S2 verified</strong><small>Sandbox data only</small></div>
        </div>
      </aside>
      <main className="workspace">{children}</main>
    </div>
  );
}
