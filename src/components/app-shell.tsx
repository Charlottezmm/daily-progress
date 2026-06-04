import Link from "next/link";
import { QuickCapture } from "./quick-capture";

const navItems = [
  { href: "/today", label: "Today" },
  { href: "/week", label: "Week" },
  { href: "/month", label: "Month" },
  { href: "/inbox", label: "Inbox" },
  { href: "/import", label: "Import" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <aside className="fixed inset-y-0 left-0 hidden w-56 border-r border-zinc-200 bg-white p-4 md:block">
        <div className="mb-6 text-sm font-semibold">Daily Progress</div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="block rounded px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100">
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="min-h-screen p-4 md:ml-56 md:p-6">
        <div className="mx-auto mb-6 max-w-5xl">
          <QuickCapture />
        </div>
        {children}
      </main>
    </div>
  );
}
