import React, { useState, useCallback, useEffect } from "react";
import { Dialog, RadioGroup, THEME } from "@atyrode/excalidraw"; // Import RadioGroup and THEME
import { Range } from "./Range";
import { UserSettings, DEFAULT_SETTINGS } from "../types/settings";
import { RefreshCw, Sun, Moon, MonitorCog } from "lucide-react";
import { normalizeCanvasData } from "../utils/canvasUtils";
import { capture } from "../utils/posthog";
import { api } from "../api/hooks";
import clsx from "clsx";
import "./SettingsDialog.scss";

interface SettingsDialogProps {
  excalidrawAPI?: any;
  onClose?: () => void;
}

// Use the actual theme values from Excalidraw + 'system'
type AppTheme = typeof THEME.LIGHT | typeof THEME.DARK | 'system';

const SettingsDialog: React.FC<SettingsDialogProps> = ({
  excalidrawAPI,
  onClose,
}) => {
  const [modalIsShown, setModalIsShown] = useState(true);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  // Initialize theme state based on current appState theme or default to 'system'
  const [selectedTheme, setSelectedTheme] = useState<AppTheme>(
    excalidrawAPI?.getAppState()?.theme || 'system'
  );
  const [showRestoreConfirmation, setShowRestoreConfirmation] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Get current settings and theme from excalidrawAPI when component mounts
  useEffect(() => {
    if (excalidrawAPI) {
      const appState = excalidrawAPI.getAppState();
      const userSettings = appState?.pad?.userSettings || {};
      setSettings({
        ...DEFAULT_SETTINGS,
        ...userSettings
      });
      // Ensure selectedTheme state is synced if appState changes externally
      if (appState?.theme && appState.theme !== selectedTheme) {
        setSelectedTheme(appState.theme);
      }
    }
  }, [excalidrawAPI, selectedTheme]); // Add selectedTheme dependency

  const handleThemeChange = (newTheme: AppTheme) => {
    if (!excalidrawAPI) return;

    setSelectedTheme(newTheme); // Update local state for RadioGroup UI

    // Update the appState
    const appState = excalidrawAPI.getAppState();
    const updatedAppState = {
      ...appState,
      theme: newTheme, // Set the theme in appState
    };
    
    excalidrawAPI.updateScene({
      appState: updatedAppState
    });
  };

  const handleClose = useCallback(() => {
    setModalIsShown(false);
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  const handleRestoreTutorialCanvas = async () => {
    if (!excalidrawAPI) return;
    
    try {
      setIsRestoring(true);
      capture('restore_tutorial_canvas_clicked');
      
      // Use the API function from hooks.ts to fetch the default canvas
      const defaultCanvasData = await api.getDefaultCanvas();
      
      console.debug("Default canvas data:", defaultCanvasData);
      
      // Normalize the canvas data before updating the scene
      const normalizedData = normalizeCanvasData(defaultCanvasData);
      
      // Update the canvas with the normalized default data
      excalidrawAPI.updateScene(normalizedData);
      
      console.debug("Canvas reset to default successfully");
      
      // Close the dialog after successful restore
      handleClose();
    } catch (error) {
      console.error("Failed to reset canvas:", error);
    } finally {
      setIsRestoring(false);
      setShowRestoreConfirmation(false);
    }
  };

  /**
   * Updates a specific setting and syncs it with the excalidraw app state
   * @param key The setting key to update
   * @param value The new value for the setting
   */
  const updateSetting = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    if (!excalidrawAPI) return;

    const newSettings = {
      ...settings,
      [key]: value
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

      {/* Theme Selector Section */}
      <div className="settings-dialog__section">
        <h3 className="settings-dialog__section-title">Theme</h3>
        <RadioGroup
          choices={[
            { value: THEME.LIGHT, label: <Sun size={20} />, ariaLabel: "Light Theme" },
            { value: THEME.DARK, label: <Moon size={20} />, ariaLabel: "Dark Theme" },
            { value: 'system', label: <MonitorCog size={20} />, ariaLabel: "System Theme" },
          ]}
          value={selectedTheme}
          onChange={handleThemeChange}
          name="theme"
        />
      </div>

      {/* Embed Settings Section */}
      <div className="settings-dialog__section">
        <h3 className="settings-dialog__section-title">Embed Settings</h3>
        <div className="settings-dialog__setting">
          <label className="settings-dialog__label">
            Embed Lock Time: {settings.embedLockDebounceTime}ms
          </label>
          <div className="settings-dialog__range-container">
          <Range
            value={Math.round(((settings.embedLockDebounceTime || 350) - 150) / 4850 * 100)}
            onChange={(value) => updateSetting(
              'embedLockDebounceTime',
              // Map 0-100 range to 150-5000ms, rounded to nearest multiple of 50
              Math.round((150 + (value / 100) * 4850) / 50) * 50
            )}
            min={0}
            max={100}
            step={1}
            minLabel="150ms"
            maxLabel="5000ms"
            showValueBubble={false}
          />
          </div>
        </div>
      </div>

      {/* Canvas Management Section */}
      <div className="settings-dialog__section">
        <h3 className="settings-dialog__section-title">Canvas Management</h3>
        {showRestoreConfirmation ? (
          <div className="settings-dialog__confirmation">
            <p>Are you sure you want to restore the tutorial canvas?</p>
            <p className="settings-dialog__warning">This will replace your current canvas and cannot be undone!</p>
            <div className="settings-dialog__actions">
              <button 
                className="settings-dialog__button settings-dialog__button--restore" 
                onClick={handleRestoreTutorialCanvas}
                disabled={isRestoring}
              >
                {isRestoring ? "Restoring..." : "I'm sure"}
              </button>
              <button 
                className="settings-dialog__button settings-dialog__button--cancel" 
                onClick={() => setShowRestoreConfirmation(false)}
                disabled={isRestoring}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="settings-dialog__setting">
            <button 
              className="settings-dialog__restore-button"
              onClick={() => setShowRestoreConfirmation(true)}
            >
              <RefreshCw size={16} />
              <span>Restore Tutorial Canvas</span>
            </button>
          </div>
        )}
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
