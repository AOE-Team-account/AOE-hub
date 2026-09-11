"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

// Matches hub-prototype.html: Experience Board is always visible, but the
// File Board and Groups tabs are intentionally hidden from the nav bar for
// logged-out visitors (they can still reach the File Board via the explicit
// "browse the File Board" link on the homepage — viewing it needs no
// account, it's just decluttered from the tab bar until signed in).
const TABS = [
  { href: "/experience", label: "Experience board", hideWhenLoggedOut: false },
  { href: "/files", label: "File board", hideWhenLoggedOut: true },
  { href: "/groups", label: "Groups", hideWhenLoggedOut: true },
];

export function PrimaryTabs() {
  const pathname = usePathname();
  const { status } = useAuth();

  const tabs = TABS.filter((t) => status === "authed" || !t.hideWhenLoggedOut);

  return (
    <div className="primary-tabs">
      {tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} className={pathname.startsWith(tab.href) ? "active" : ""}>
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
