import React, { useState, useEffect, useMemo } from "react";
import { capture } from "../utils/posthog";
import { GoogleIcon, GithubIcon } from "../icons";
import "./AuthDialog.scss";

import { Dialog } from "@atyrode/excalidraw";

interface AuthDialogProps {
  description?: React.ReactNode;
  warningText?: string;
  onClose?: () => void;
  children?: React.ReactNode;
}

export const AuthDialog = ({
  description = <>Welcome to your <strong className="highlight">whiteboard IDE</strong>. <br /><br /> Open <strong className="highlight">terminals</strong>, <strong className="highlight">VSCode</strong>, or <strong className="highlight">Cursor</strong> in your pad, and start coding right away.</>,
  warningText = <>This is an open-source project in beta.<br /> Back up your work!</>,
  onClose,
  children,
}: AuthDialogProps) => {
  const [modalIsShown, setModalIsShown] = useState(true);
  
  // Array of random messages that the logo can "say"
  const logoMessages = [
    "Hello there!",
    "Welcome to pad.ws!",
    "Ready to code?",
    "Let's build something cool!",
    "Code, collaborate, create!",
    "Happy coding!",
    "Ideas become reality here!",
    "Let's get productive!",
    "Let's turn ideas into code!"
  ];
  
  // Select a random message when component mounts
  const randomMessage = useMemo(() => {
    const randomIndex = Math.floor(Math.random() * logoMessages.length);
    return logoMessages[randomIndex];
  }, []);
  
  useEffect(() => {
    capture("auth_modal_shown");
    
    // Load GitHub buttons script
    const script = document.createElement('script');
    script.src = 'https://buttons.github.io/buttons.js';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
    
    return () => {
      // Clean up script when component unmounts
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  useEffect(() => {
    const checkLocalStorage = () => {
      const authCompleted = localStorage.getItem('auth_completed');
      if (authCompleted) {
        localStorage.removeItem('auth_completed');
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
                {/* Warning message */}
                <div className="auth-modal__warning">
          {warningText}
        </div>

        {/* GitHub Star button */}
        <a className="github-button" 
           href="https://github.com/pad-ws/pad.ws" 
           data-color-scheme="no-preference: dark_dimmed; light: dark_dimmed; dark: dark_dimmed;" 
           data-icon="octicon-star" 
           data-size="large" 
           data-show-count="true" 
           aria-label="Star pad-ws/pad.ws on GitHub">
          Star
        </a>


      </div>
      
    </div>
  );

  return (
    <>
      {modalIsShown && (
        <div className="auth-modal__wrapper">
          <div className="auth-modal__logo-container">
            <img 
              src="/assets/images/favicon.png" 
              alt="pad.ws logo" 
              className="auth-modal__logo" 
            />
            <div className="auth-modal__logo-speech-bubble">
              {randomMessage}
            </div>
          </div>
          <Dialog
            className="auth-modal"
            size="small"
            onCloseRequest={handleClose}
            title={
              <div id="modal-title" className="auth-modal__title-container">
                <h2 className="auth-modal__title">pad<span className="auth-modal__title-dot">.ws</span></h2>
              </div>
            }
            closeOnClickOutside={false}
            children={children || dialogContent}
          />
        </div>
      )}
    </>
  );
};

export default AuthDialog;
