import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import "../styles/Modal.scss";

interface ModalProps {
  children: React.ReactNode;
  showLogo?: boolean;
  logoSrc?: string;
  logoAlt?: string;
  maxWidth?: string | number;
  className?: string;
  isExiting?: boolean;
  onExitComplete?: () => void;
}

const Modal: React.FC<ModalProps> = ({
  children,
  showLogo = true,
  logoSrc = "/assets/images/favicon.png",
  logoAlt = "Logo",
  maxWidth = "500px",
  className = "",
  isExiting = false,
  onExitComplete,
}) => {
  // For entrance: Modal appears first, then logo with delay
  // For exit: Logo disappears first, then modal with delay
  const overlayAnimation = isExiting ? "modalFadeOut" : "modalFadeIn";
  const containerAnimation = isExiting ? "modalZoomOut" : "modalZoomIn";
  const faviconAnimation = isExiting ? "fadeOutSlideDown" : "fadeInSlideUp";
  
  // Animation delays
  const overlayDelay = isExiting ? "0.3s" : "0s"; // Delay modal exit until logo animation completes
  const containerDelay = isExiting ? "0.3s" : "0s"; // Delay container exit until logo animation completes
  const faviconDelay = isExiting ? "0s" : "0.3s"; // Logo appears with delay on entrance, but exits immediately
  
  // Handle exit animation completion
  useEffect(() => {
    if (isExiting && onExitComplete) {
      // Wait for all animations to complete before calling onExitComplete
      // Logo animation (0.3s) + delay (0.3s) + modal animation (0.3s)
      const timer = setTimeout(() => {
        onExitComplete();
      }, 600); // Total animation duration with delay
      
      return () => clearTimeout(timer);
    }
  }, [isExiting, onExitComplete]);
  
  const modalContent = (
    <div 
      className="modal__overlay"
      style={{ 
        animation: `${overlayAnimation} 0.3s ease-out forwards`,
        animationDelay: overlayDelay
      }}
    >
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
            style={{ 
              animation: `${faviconAnimation} 0.3s ease-out forwards`,
              animationDelay: faviconDelay
            }}
          />
        )}
        {/* Modal container with animation */}
        <div
          className={`modal__container ${className}`}
          style={{ 
            maxWidth,
            animation: `${containerAnimation} 0.3s ease-out forwards`,
            animationDelay: containerDelay
          }}
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
