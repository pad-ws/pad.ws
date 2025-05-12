import React, { Children, cloneElement, useState, useEffect } from 'react';
import DiscordButton from './ui/DiscordButton';
import GitHubButton from './ui/GitHubButton';
import type { ExcalidrawImperativeAPI } from '@atyrode/excalidraw/types';
import type { NonDeletedExcalidrawElement } from '@atyrode/excalidraw/element/types';
import type { AppState } from '@atyrode/excalidraw/types';
import { MainMenuConfig } from './ui/MainMenu';
import { lockEmbeddables, renderCustomEmbeddable } from './CustomEmbeddableRenderer';
import AuthDialog from './ui/AuthDialog';
import SettingsDialog from './ui/SettingsDialog';
import { capture } from './utils/posthog';

const defaultInitialData = {
  elements: [],
  appState: {
    gridModeEnabled: true,
    gridSize: 20,
    gridStep: 5,
  },
  files: {},
};

interface ExcalidrawWrapperProps {
  children: React.ReactNode;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  setExcalidrawAPI: (api: ExcalidrawImperativeAPI) => void;
  initialData?: any;
  onChange: (elements: NonDeletedExcalidrawElement[], state: AppState) => void;
  onScrollChange: (scrollX: number, scrollY: number) => void;
  MainMenu: any;
  renderTopRightUI?: () => React.ReactNode;
}

export const ExcalidrawWrapper: React.FC<ExcalidrawWrapperProps> = ({
  children,
  excalidrawAPI,
  setExcalidrawAPI,
  initialData,
  onChange,
  onScrollChange,
  MainMenu,
  renderTopRightUI,
}) => {

  const isAuthenticated = false; //TODO

  // Add state for modal animation
  const [isExiting, setIsExiting] = useState(false);
  
  // State for modals
  const [showPadsModal, setShowPadsModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  // Handle auth state changes
  useEffect(() => {
    if (isAuthenticated) {
      setIsExiting(true);
      capture('signed_in');
    }
  }, [isAuthenticated]);
  
  const handleClosePadsModal = () => {
    setShowPadsModal(false);
  };
  
  const handleCloseSettingsModal = () => {
    setShowSettingsModal(false);
  };
  
  const renderExcalidraw = (children: React.ReactNode) => {
    const Excalidraw = Children.toArray(children).find(
      (child: any) =>
        React.isValidElement(child) &&
        typeof child.type !== "string" &&
        child.type.displayName === "Excalidraw",
    );

    if (!Excalidraw) {
      return null;
    }

    return cloneElement(
      Excalidraw as React.ReactElement,
      {
        excalidrawAPI: (api: ExcalidrawImperativeAPI) => setExcalidrawAPI(api),
        theme: "dark",
        initialData: initialData ?? defaultInitialData,
        onChange: onChange,
        name: "Pad.ws",
        onScrollChange: (scrollX, scrollY) => {
          lockEmbeddables(excalidrawAPI?.getAppState());
          if (onScrollChange) onScrollChange(scrollX, scrollY);
        },
        validateEmbeddable: true,
        renderEmbeddable: (element, appState) => renderCustomEmbeddable(element, appState, excalidrawAPI),
        renderTopRightUI: renderTopRightUI ?? (() => (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <GitHubButton />
            <DiscordButton />
          </div>
        )),
      },
      <>
        <MainMenuConfig 
          MainMenu={MainMenu} 
          excalidrawAPI={excalidrawAPI} 
          showPadsModal={showPadsModal}
          setShowPadsModal={setShowPadsModal}
          showSettingsModal={showSettingsModal}
          setShowSettingsModal={setShowSettingsModal}
        />
        {isAuthenticated === false && (
          <AuthDialog 
            onClose={() => {}}
          />
        )}
        
        {showSettingsModal && (
          <SettingsDialog
            excalidrawAPI={excalidrawAPI}
            onClose={handleCloseSettingsModal}
          />
        )}
      </>
    );
  };

  return (
    <div className="excalidraw-wrapper">
      {renderExcalidraw(children)}
    </div>
  );
};
