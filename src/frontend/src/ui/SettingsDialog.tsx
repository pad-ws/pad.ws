import React, { useState, useCallback } from "react";
import { Dialog } from "@atyrode/excalidraw";
import "./SettingsDialog.scss";

interface SettingsDialogProps {
  onClose?: () => void;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({
  onClose,
}) => {
  const [modalIsShown, setModalIsShown] = useState(true);

  const handleClose = useCallback(() => {
    setModalIsShown(false);
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  // Dialog content
  const dialogContent = (
    <div className="settings-dialog__content">
      {/* Settings content will go here in the future */}
      <div className="settings-dialog__empty">Settings dialog is empty for now</div>
    </div>
  );

  return (
    <>
      {modalIsShown && (
        <div className="settings-dialog__wrapper">
          <Dialog
            className="settings-dialog"
            size="small"
            onCloseRequest={handleClose}
            title={
              <div className="settings-dialog__title-container">
                <h2 className="settings-dialog__title">Settings</h2>
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

export default SettingsDialog;
