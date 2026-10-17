"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";

// Keeps a signed-in member's language choice on their profile, so it follows
// them to any device. On sign-in a saved profile language wins over what this
// browser guessed; after that, every change the member makes is saved.
export function LanguageSync() {
  const { user, hydrated } = useAuth();
  const { lang, setLang } = useLanguage();
  const adoptedFor = useRef<string | null>(null);
  const savedAs = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrated || !user) return;
    // Once per sign-in: adopt the saved language, if there is one.
    if (adoptedFor.current !== user.id) {
      adoptedFor.current = user.id;
      savedAs.current = user.language;
      if (user.language && user.language !== lang) {
        setLang(user.language);
        return;
      }
    }
    if (savedAs.current !== lang) {
      savedAs.current = lang;
      createClient().from("profiles").update({ language: lang }).eq("id", user.id).then(() => {});
    }
  }, [hydrated, user, lang, setLang]);

  return null;
}
