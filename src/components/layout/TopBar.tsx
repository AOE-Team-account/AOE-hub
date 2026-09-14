"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGE_LABELS, LANGUAGE_ORDER } from "@/lib/i18n/dictionaries";
import { getNotifications } from "@/lib/mock-data";
import type { LanguageCode } from "@/lib/types";

type DropdownId = "plus" | "notif" | "avatar" | null;

export function TopBar() {
  const { status, user, signOut } = useAuth();
  const { lang, setLang, dict } = useLanguage();
  const router = useRouter();
  const [openDropdown, setOpenDropdown] = useState<DropdownId>(null);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  function toggleDropdown(id: DropdownId) {
    setOpenDropdown((cur) => (cur === id ? null : id));
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && search.trim()) {
      router.push(`/files?q=${encodeURIComponent(search.trim())}`);
    }
  }

  const notifications = getNotifications();

  return (
    <div className="topbar" ref={containerRef}>
      <div className="topbar-inner">
        <Link href={status === "authed" ? "/experience" : "/"} className="brand">
          AOEhub
        </Link>

        <div className="search-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            placeholder="Search files, experiences, groups..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSearchKeyDown}
          />
        </div>

        <div className="header-actions">
          {status === "authed" ? (
            <>
              <div className="plus-wrap">
                <button
                  className="plus-btn"
                  aria-label="Create"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDropdown("plus");
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
                <div className={`dropdown${openDropdown === "plus" ? " open" : ""}`}>
                  <Link href="/files/new" onClick={() => setOpenDropdown(null)}>
                    Upload a file
                  </Link>
                  <Link href="/experience/new" onClick={() => setOpenDropdown(null)}>
                    Share an experience
                  </Link>
                  {user?.isAdmin && (
                    <Link href="/experience/announce" onClick={() => setOpenDropdown(null)}>
                      Post an announcement <span className="admin-tag">admin only</span>
                    </Link>
                  )}
                </div>
              </div>

              <div className="avatar-wrap">
                <button
                  className="icon-btn"
                  aria-label="Notifications"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDropdown("notif");
                  }}
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                  </svg>
                  {notifications.some((n) => !n.read) && <span className="dot" />}
                </button>
                <div className={`dropdown${openDropdown === "notif" ? " open" : ""}`}>
                  {notifications.map((n, i) => (
                    <div key={n.id}>
                      <div className="notif-item">{n.body}</div>
                      {i < notifications.length - 1 && <hr />}
                    </div>
                  ))}
                </div>
              </div>

              <div className="avatar-wrap">
                <button
                  className="avatar-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDropdown("avatar");
                  }}
                >
                  {user?.initials}
                </button>
                <div className={`dropdown${openDropdown === "avatar" ? " open" : ""}`}>
                  <Link href="/profile" onClick={() => setOpenDropdown(null)}>
                    Profile
                  </Link>
                  <Link href="/settings" onClick={() => setOpenDropdown(null)}>
                    Settings
                  </Link>
                  {user?.isAdmin && (
                    <Link href="/admin" onClick={() => setOpenDropdown(null)}>
                      Admin dashboard <span className="admin-tag">admin only</span>
                    </Link>
                  )}
                  <hr />
                  <button onClick={signOut}>Sign out</button>
                </div>
              </div>
            </>
          ) : (
            <div className="loggedout-actions">
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as LanguageCode)}
                style={{ width: "auto", padding: "8px 10px", fontSize: 13 }}
                aria-label="Language"
              >
                {LANGUAGE_ORDER.map((code) => (
                  <option key={code} value={code}>
                    {LANGUAGE_LABELS[code]}
                  </option>
                ))}
              </select>
              <button className="btn" onClick={() => router.push("/login")}>
                {dict.headerLogin}
              </button>
              <button className="btn primary" onClick={() => router.push("/signup")}>
                {dict.headerSignup}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
