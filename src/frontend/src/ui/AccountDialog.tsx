import React, { useState, useCallback } from "react";
import { Dialog } from "@atyrode/excalidraw";
import { useUserProfile } from "../api/hooks";
import md5 from 'crypto-js/md5';
import "./AccountDialog.scss";

interface AccountDialogProps {
  excalidrawAPI?: any;
  onClose?: () => void;
}

// Function to generate gravatar URL
const getGravatarUrl = (email: string, size = 100) => {
  const hash = md5(email.toLowerCase().trim()).toString();
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
};

const AccountDialog: React.FC<AccountDialogProps> = ({
  excalidrawAPI,
  onClose,
}) => {
  const [modalIsShown, setModalIsShown] = useState(true);
  const { data: profile, isLoading, isError } = useUserProfile();

  const handleClose = useCallback(() => {
    setModalIsShown(false);
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  // Dialog content with user profile information
  const dialogContent = (
    <div className="account-dialog__content">
      {isLoading && (
        <div className="account-dialog__loading">
          Loading account information...
        </div>
      )}
      
      {isError && (
        <div className="account-dialog__error">
          Error loading account information. Please try again later.
        </div>
      )}
      
      {profile && !isLoading && !isError && (
        <div className="account-dialog__profile">
          <div className="account-dialog__avatar">
            <img 
              src={getGravatarUrl(profile.email)} 
              alt={profile.username} 
              className="account-dialog__gravatar" 
            />
          </div>
          <div className="account-dialog__user-info">
            <h2 className="account-dialog__name">
              {profile.name || profile.username}
              {profile.email_verified && (
                <span className="account-dialog__verified">✓ Verified</span>
              )}
            </h2>
            <p className="account-dialog__username">{profile.username}</p>
            <p className="account-dialog__user-id">{profile.id}</p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {modalIsShown && (
        <div className="account-dialog__wrapper">
          <Dialog
            className="account-dialog"
            size="small"
            onCloseRequest={handleClose}
            title={
              <div className="account-dialog__title-container">
                <h2 className="account-dialog__title">Account</h2>
              </div>
            }
            closeOnClickOutside={true}
            children={dialogContent}
          />
        </div>
      )}
    </>
  );
};

export default AccountDialog;
