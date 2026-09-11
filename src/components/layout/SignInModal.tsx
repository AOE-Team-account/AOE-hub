"use client";

import { useAuth } from "@/contexts/AuthContext";
import { Modal } from "@/components/ui/Modal";

export function SignInModal() {
  const { isSignInModalOpen, closeSignInModal, startSignup } = useAuth();

  return (
    <Modal open={isSignInModalOpen} onClose={closeSignInModal}>
      <p className="title">Sign in to continue</p>
      <p className="muted">
        Browsing is always free. Downloading, posting, uploading, remixing, commenting, following, reporting, and
        joining groups need an account.
      </p>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" onClick={startSignup}>
          Sign up free
        </button>
        <button className="btn" onClick={closeSignInModal}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
