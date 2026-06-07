"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { QuickCapture } from "./quick-capture";

const navItems = [
  { href: "/today", label: "Today" },
  { href: "/week", label: "Week" },
  { href: "/month", label: "Month" },
  { href: "/inbox", label: "Inbox" },
  { href: "/import", label: "Import" },
  { href: "/reschedule", label: "Reschedule" },
  { href: "/settings", label: "Settings" },
];

const primaryMobileNavItems = navItems.filter((item) => ["/today", "/week", "/month", "/inbox"].includes(item.href));
const secondaryMobileNavItems = navItems.filter((item) => !primaryMobileNavItems.includes(item));

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand" aria-label="Daily Progress">
          <span className="app-brand-mark" aria-hidden="true">
            DP
          </span>
          <span>
            <span className="app-brand-name">Daily Progress</span>
            <span className="app-brand-subtitle">planning workspace</span>
          </span>
        </div>
        <nav className="app-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="app-nav-link" aria-current={isActive(item.href) ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="app-workspace">
        <header className="app-topbar">
          <div className="mobile-brand" aria-label="Daily Progress">
            <span className="app-brand-mark" aria-hidden="true">
              DP
            </span>
            <span className="app-brand-name">Daily Progress</span>
          </div>
          <QuickCapture />
          <nav className="mobile-secondary-nav" aria-label="More navigation">
            {secondaryMobileNavItems.map((item) => (
              <Link key={item.href} href={item.href} className="mobile-secondary-link" aria-current={isActive(item.href) ? "page" : undefined}>
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="app-content">{children}</main>
        <nav className="mobile-tabbar" aria-label="Mobile navigation">
          {primaryMobileNavItems.map((item) => (
            <Link key={item.href} href={item.href} className="mobile-tab" aria-current={isActive(item.href) ? "page" : undefined}>
              <span className="mobile-tab-dot" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
