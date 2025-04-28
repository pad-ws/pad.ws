import React, { useState, useCallback, useEffect } from "react";
import { Dialog, Range } from "@atyrode/excalidraw";
import { UserSettings, DEFAULT_SETTINGS } from "../types/settings";
import "./SettingsDialog.scss";

interface SettingsDialogProps {
  excalidrawAPI?: any;
  onClose?: () => void;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({
  excalidrawAPI,
  onClose,
}) => {
  const [modalIsShown, setModalIsShown] = useState(true);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  // Get current settings from excalidrawAPI when component mounts
  useEffect(() => {
    if (excalidrawAPI) {
      const appState = excalidrawAPI.getAppState();
      const userSettings = appState?.pad?.userSettings || {};
      setSettings({
        ...DEFAULT_SETTINGS,
        ...userSettings
      });
    }
  }, [excalidrawAPI]);

  const handleClose = useCallback(() => {
    setModalIsShown(false);
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  const handleEmbedLockDebounceTimeChange = (value: number) => {
    if (!excalidrawAPI) return;

    const newSettings = {
      ...settings,
      embedLockDebounceTime: value
    };
    
    setSettings(newSettings);
    
    // Update the appState
    const appState = excalidrawAPI.getAppState();
    const updatedAppState = {
      ...appState,
      pad: {
        ...appState.pad,
        userSettings: newSettings
      }
    };
    
    excalidrawAPI.updateScene({
      appState: updatedAppState
    });
  };

  // Dialog content
  const dialogContent = (
    <div className="settings-dialog__content">
      <div className="settings-dialog__section">
        <h3 className="settings-dialog__section-title">Embed Settings</h3>
        <div className="settings-dialog__setting">
          <label className="settings-dialog__label">
            Embed Lock Debounce Time: {settings.embedLockDebounceTime}ms
          </label>
          <div className="settings-dialog__range-container">
            <Range
              updateData={(value) => handleEmbedLockDebounceTimeChange(
                // Map 0-100 range to 150-5000ms
                Math.round(150 + (value / 100) * 4850)
              )}
              appState={{
                currentItemOpacity: 
                  // Map 150-5000ms to 0-100 range
                  Math.round(((settings.embedLockDebounceTime || 350) - 150) / 4850 * 100)
              }}
              elements={[]}
              testId="embed-lock-debounce-time"
            />
          </div>
          <div className="settings-dialog__range-labels">
            <span>150ms</span>
            <span>5000ms</span>
          </div>
        </div>
      </div>
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
