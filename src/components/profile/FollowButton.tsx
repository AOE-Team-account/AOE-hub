"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/Button";

export function FollowButton() {
  const { t } = useLanguage();
  const { requireAuth } = useAuth();
  const [following, setFollowing] = useState(false);

  return (
    <Button variant={following ? "default" : "primary"} onClick={() => requireAuth() && setFollowing((f) => !f)}>
      {following ? t("profile.unfollow") : t("profile.follow")}
    </Button>
  );
}
