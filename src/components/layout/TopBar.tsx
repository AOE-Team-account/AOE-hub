"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import type { NotificationItem } from "@/lib/types";

type DropdownId = "plus" | "notif" | "avatar" | null;

export function TopBar() {
  const { status, user, signOut } = useAuth();
  const { lang, setLang, t, languages } = useLanguage();
  const router = useRouter();
  // The reviewer panels are review-only: no create menu inside them.
  const pathname = usePathname();
  const inPanel = pathname.startsWith("/mod") || pathname.startsWith("/creator");
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

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotifications([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (cancelled) return;
      setNotifications(
        (data ?? []).map((row) => ({ id: row.id, body: row.body, createdAt: row.created_at, read: row.read }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

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
            placeholder={t("nav.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSearchKeyDown}
          />
        </div>

        <div className="header-actions">
          {status === "authed" ? (
            <>
              {!inPanel && (
              <div className="plus-wrap">
                <button
                  className="plus-btn"
                  aria-label={t("nav.create")}
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
                    {t("nav.uploadFile")}
                  </Link>
                  <Link href="/experience/new" onClick={() => setOpenDropdown(null)}>
                    {t("nav.shareExperience")}
                  </Link>
                </div>
              </div>
              )}

              <div className="avatar-wrap">
                <button
                  className="icon-btn"
                  aria-label={t("nav.notifications")}
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
                  {notifications.length === 0 && <div className="notif-item">{t("nav.noNotifications")}</div>}
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
                    {t("nav.profile")}
                  </Link>
                  <Link href="/settings" onClick={() => setOpenDropdown(null)}>
                    {t("nav.settings")}
                  </Link>
                  <hr />
                  <button onClick={signOut}>{t("common.signOut")}</button>
                </div>
              </div>
            </>
          ) : (
            <div className="loggedout-actions">
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                style={{ width: "auto", padding: "8px 10px", fontSize: 13 }}
                aria-label={t("common.language")}
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
              <button className="btn" onClick={() => router.push("/login")}>
                {t("common.logIn")}
              </button>
              <button className="btn primary" onClick={() => router.push("/signup")}>
                {t("common.signUp")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
