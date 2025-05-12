import React, { useMemo } from "react";
//import { capture } from "../utils/posthog";
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

  const randomMessage = useMemo(() =>
    logoMessages[Math.floor(Math.random() * logoMessages.length)],
    []
  );

  const dialogContent = (
    <div className="auth-modal__content">
      <p className="auth-modal__description">{description}</p>

      <div className="auth-modal__buttons">
        <button onClick={() => window.open("/api/auth/login?kc_idp_hint=google&popup=1", "authPopup", "width=500,height=700,noopener,noreferrer")}>
          <GoogleIcon className="google-icon" />
          <span>Continue with Google</span>
        </button>

        <button onClick={() => window.open("/api/auth/login?kc_idp_hint=github&popup=1", "authPopup", "width=500,height=700,noopener,noreferrer")}>
          <GithubIcon />
          <span>Continue with GitHub</span>
        </button>
      </div>

      <div className="auth-modal__footer">
        <div className="auth-modal__warning">
          {warningText}
        </div>
      </div>
    </div>
  );

  return (
    <div className="auth-modal__wrapper">
      <div className="auth-modal__logo-container">
        <img src="/assets/images/favicon.png" alt="pad.ws logo" className="auth-modal__logo" />
        <div className="auth-modal__logo-speech-bubble">{randomMessage}</div>
      </div>
      <Dialog
        className="auth-modal"
        size="small"
        onCloseRequest={() => { }}
        title={
          <div id="modal-title" className="auth-modal__title-container">
            <h2 className="auth-modal__title">pad<span className="auth-modal__title-dot">.ws</span></h2>
          </div>
        }
        closeOnClickOutside={false}
        children={children || dialogContent}
      />
    </div>
  );
};

export default AuthDialog;
