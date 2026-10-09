"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

// Deliberate deviation from hub-prototype.html: the prototype hid the File
// Board tab from logged-out visitors, which stranded them on the Experience
// Board with no way back except the homepage. Both boards are readable
// without an account, so both tabs show for everyone.
const TABS = [
  { href: "/experience", label: "Experience board", hideWhenLoggedOut: false },
  { href: "/files", label: "File board", hideWhenLoggedOut: false },
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
