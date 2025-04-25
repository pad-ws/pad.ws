import React from "react";
import ReactDOM from "react-dom";
import "../styles/Modal.scss";

interface ModalProps {
  children: React.ReactNode;
  showLogo?: boolean;
  logoSrc?: string;
  logoAlt?: string;
  maxWidth?: string | number;
  className?: string;
}

const Modal: React.FC<ModalProps> = ({
  children,
  showLogo = true,
  logoSrc = "/assets/images/favicon.png",
  logoAlt = "Logo",
  maxWidth = "500px",
  className = "",
}) => {
  const modalContent = (
    <div className="modal__overlay">
      {/* Backdrop with blur effect */}
      <div className="modal__backdrop" aria-hidden="true" />

      {/* Wrapper for logo and modal, to position logo behind modal */}
      <div className="modal__wrapper">
        {/* Logo behind modal */}
        {showLogo && (
          <img
            src={logoSrc}
            className="modal__favicon"
            alt={logoAlt}
            aria-hidden="true"
          />
        )}
        {/* Modal container with animation */}
        <div
          className={`modal__container ${className}`}
          style={{ maxWidth }}
          role="dialog"
          aria-modal="true"
        >
          {children}
        </div>
      </div>
    </div>
  );

  // Use createPortal to render the modal at the end of the document body
  return ReactDOM.createPortal(modalContent, document.body);
};

export default Modal;
