"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";

export function FollowButton() {
  const { requireAuth } = useAuth();
  const [following, setFollowing] = useState(false);

  return (
    <Button variant={following ? "default" : "primary"} onClick={() => requireAuth() && setFollowing((f) => !f)}>
      {following ? "Unfollow" : "Follow"}
    </Button>
  );
}
