import React, { useState, useEffect } from "react";
import { capture } from "../utils/posthog";
import { Mail } from "lucide-react";
import { queryClient } from "../api/queryClient";
import { GoogleIcon, GithubIcon, DiscordIcon } from "../icons";

import { Dialog } from "@atyrode/excalidraw";

interface AuthDialogProps {
  description?: React.ReactNode;
  warningText?: string;
  onClose?: () => void;
  children?: React.ReactNode;
}

export const AuthDialog = ({
  description = <>Welcome to your <strong className="highlight">whiteboard IDE</strong>. <br /><br /> Open <strong className="highlight">terminals</strong> and start coding right away in your own <strong className="highlight">Ubuntu VM</strong>!</>,
  warningText = "This is a beta. Backup your work!",
  onClose,
  children,
}: AuthDialogProps) => {
  const [modalIsShown, setModalIsShown] = useState(true);
  
  useEffect(() => {
    capture("auth_modal_shown");
  }, []);

  useEffect(() => {
    const checkLocalStorage = () => {
      const authCompleted = localStorage.getItem('auth_completed');
      if (authCompleted) {
        localStorage.removeItem('auth_completed');
        queryClient.invalidateQueries({ queryKey: ['auth'] });
        clearInterval(intervalId);
        handleClose();
      }
    };
    
    const intervalId = setInterval(checkLocalStorage, 500);
    
    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const handleClose = React.useCallback(() => {
    setModalIsShown(false);

    if (onClose) {
      onClose();
    }
  }, [onClose]);

  // Prepare the content for the Dialog
  const dialogContent = (
    <div className="auth-modal__content">

      <p className="auth-modal__description">{description}</p>
      
      {/* Sign-in buttons */}
      <div className="auth-modal__buttons">
        <button
          onClick={() => {
            window.open(
              "/auth/login?kc_idp_hint=google&popup=1",
              "authPopup",
              "width=500,height=700,noopener,noreferrer"
            );
          }}
        >
          <GoogleIcon className="google-icon" />
          <span>Continue with Google</span>
        </button>

        <button
          onClick={() => {
            window.open(
              "/auth/login?kc_idp_hint=github&popup=1",
              "authPopup",
              "width=500,height=700,noopener,noreferrer"
            );
          }}
        >
          <GithubIcon />
          <span>Continue with GitHub</span>
        </button>
      </div>

      {/* Footer */}
      <div className="auth-modal__footer">
        <a href="https://discord.com/invite/NnXSESxWpA" className="auth-modal__footer-link" target="_blank" rel="noopener noreferrer">
          <DiscordIcon />
        </a>
        |
        <a href="https://github.com/pad-ws/pad.ws" className="auth-modal__footer-link" target="_blank" rel="noopener noreferrer">
          <GithubIcon />
        </a>
        |
        <a href="mailto:contact@pad.ws" className="auth-modal__footer-link" target="_blank" rel="noopener noreferrer">
          <Mail size={20} />
        </a>
      </div>
      
      {/* Warning message */}
      <div className="auth-modal__warning">
        {warningText}
      </div>
    </div>
  );

  return (
    <>
      {modalIsShown && (
        <Dialog
          className="auth-modal"
          size="small"
          onCloseRequest={handleClose}
          title={
            <div id="modal-title" className="auth-modal__title-container">
              {/* <img 
                src="/assets/images/favicon.png" 
                alt="pad.ws logo" 
                className="auth-modal__logo" 
              /> */}
              <h2 className="auth-modal__title">pad<span className="auth-modal__title-dot">.ws</span></h2>
            </div>
          }
          closeOnClickOutside={false}
          children={children || dialogContent}
        />
      )}
    </>
  );
};

export default AuthDialog;
