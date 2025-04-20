import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import "../styles/AuthModal.scss";

interface AuthModalProps {
  title?: string;
  description?: string;
  infoText?: string;
}

const AuthModal: React.FC<AuthModalProps> = ({
  title = "pad.ws",
  description = "Welcome\n\nPad is a browser-based developer environment where you can take notes and code side to side.\n\nYour workspace is an Ubuntu virtual machine that we run for you in the cloud",
  infoText = "🚧 This is a beta. Consider all data is temporary and might be deleted at any time while we build",
}) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    // Prevent scrolling when modal is open
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

  if (!isMounted) return null;

  const modalContent = (
    <div className="auth-modal-overlay">
      {/* Backdrop with blur effect */}
      <div className="auth-modal-backdrop" aria-hidden="true" />

      {/* Modal container with animation */}
      <div
        className="auth-modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Modal content */}
        <div className="auth-modal-content">
          <div id="modal-title" className="auth-modal-title-container">
            <h2 className="auth-modal-title">pad<span style={{ color: "#fa8933" }}>.ws</span></h2>
            <span className="beta-text">(beta)</span>
          </div>

          <p className="auth-modal-description">{description}</p>

          {/* Sign-in buttons */}
          <div className="auth-modal-buttons">
            <button
              className="auth-modal-button auth-modal-button-primary"
              onClick={() => {
                window.location.href = "/auth/login?kc_idp_hint=google";
              }}
            >
              <svg
                className="google-icon"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
                <path d="M1 1h22v22H1z" fill="none" />
              </svg>
              <span>Sign in with Google</span>
            </button>

            <button
              className="auth-modal-button auth-modal-button-outline"
              onClick={() => {
                window.location.href = "/auth/login?kc_idp_hint=github";
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                <path d="M9 18c-4.51 2-5-2-7-2" />
              </svg>
              <span>Sign in with GitHub</span>
            </button>
          </div>

          {/* Info text */}
          <p className="auth-modal-info">{infoText}</p>
        </div>
      </div>
    </div>
  );

  // Use createPortal to render the modal at the end of the document body
  return ReactDOM.createPortal(modalContent, document.body);
};

export default AuthModal;
