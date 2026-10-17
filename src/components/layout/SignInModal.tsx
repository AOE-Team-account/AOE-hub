"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Modal } from "@/components/ui/Modal";
import { useLanguage } from "@/contexts/LanguageContext";

export function SignInModal() {
  const { isSignInModalOpen, closeSignInModal } = useAuth();
  const router = useRouter();
  const { t } = useLanguage();

  return (
    <Modal open={isSignInModalOpen} onClose={closeSignInModal}>
      <p className="title">{t("signin.title")}</p>
      <p className="muted">{t("signin.body")}</p>
      <div className="row" style={{ gap: 8 }}>
        <button
          className="btn primary"
          onClick={() => {
            closeSignInModal();
            router.push("/signup");
          }}
        >
          {t("common.signUpFree")}
        </button>
        <button className="btn" onClick={closeSignInModal}>
          {t("common.cancel")}
        </button>
      </div>
    </Modal>
  );
}
