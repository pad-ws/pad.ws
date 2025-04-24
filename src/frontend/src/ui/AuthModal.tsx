import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { capture } from "../utils/posthog";
import { Mail } from "lucide-react";
import { queryClient } from "../api/queryClient";

interface AuthModalProps {
  description?: React.ReactNode;
}

const AuthModal: React.FC<AuthModalProps> = ({
  description = <>Welcome to your <strong className="highlight">whiteboard IDE</strong>. Open <strong className="highlight">terminals</strong> and start coding right away in your own <strong className="highlight">Ubuntu VM</strong>!</>,
  warningText = "🚧 This is a beta. We can't guarantee data integrity! 🚧",
}) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    capture("auth_modal_shown");
  }, []);

  useEffect(() => {
    const checkLocalStorage = () => {
      const authCompleted = localStorage.getItem('auth_completed');
      if (authCompleted) {
        localStorage.removeItem('auth_completed');
        queryClient.invalidateQueries({ queryKey: ['auth'] });
        clearInterval(intervalId);
      }
    };
    
    const intervalId = setInterval(checkLocalStorage, 500);
    
    return () => {
      clearInterval(intervalId);
    };
  }, []);

  if (!isMounted) return null;

  const modalContent = (
    <div className="auth-modal-overlay">
      {/* Backdrop with blur effect */}
      <div className="auth-modal-backdrop" aria-hidden="true" />

      {/* Wrapper for logo and modal, to position logo behind modal */}
      <div className="auth-modal-wrapper">
        {/* Logo behind modal */}
        <img
          src="/assets/images/favicon.png"
          className="auth-modal-favicon"
          alt="pad.ws logo"
          aria-hidden="true"
        />
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
              <h2 className="auth-modal-title">pad<span className="auth-modal-title-dot">.ws</span></h2>
            </div>
            <div className="auth-modal-separator" />

            <p className="auth-modal-description">{description}</p>
            
            {/* Sign-in buttons */}
            <div className="auth-modal-buttons">
              <button
                className="auth-modal-button auth-modal-button-primary"
                onClick={() => {
                  window.open(
                    "/auth/login?kc_idp_hint=google&popup=1",
                    "authPopup",
                    "width=500,height=700,noopener,noreferrer"
                  );
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
                <span>Continue with Google</span>
              </button>

              <button
                className="auth-modal-button auth-modal-button-outline"
                onClick={() => {
                  window.open(
                    "/auth/login?kc_idp_hint=github&popup=1",
                    "authPopup",
                    "width=500,height=700,noopener,noreferrer"
                  );
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
                <span>Continue with GitHub</span>
              </button>
            </div>

            {/* Footer */}
            <div className="auth-modal-footer">
              <a href="https://discord.com/invite/NnXSESxWpA" className="auth-modal-footer-link" target="_blank" rel="noopener noreferrer">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 71 55"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z"
                    fill="currentColor"
                  />
                </svg>
              </a>
              |
              <a href="https://github.com/pad-ws/pad.ws" className="auth-modal-footer-link" target="_blank" rel="noopener noreferrer">
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
              </a>
              |
              <a href="mailto:contact@pad.ws" className="auth-modal-footer-link" target="_blank" rel="noopener noreferrer">
                <Mail size={20} />
              </a>
            </div>
            
            {/* Warning message */}
            <div className="auth-modal-warning">
              {warningText}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Use createPortal to render the modal at the end of the document body
  return ReactDOM.createPortal(modalContent, document.body);
};

export default AuthModal;
