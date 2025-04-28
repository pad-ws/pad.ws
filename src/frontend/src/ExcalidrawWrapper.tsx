import React, { Children, cloneElement, useState, useEffect } from 'react';
import DiscordButton from './ui/DiscordButton';
import GitHubButton from './ui/GitHubButton';
import type { ExcalidrawImperativeAPI } from '@atyrode/excalidraw/types';
import type { NonDeletedExcalidrawElement } from '@atyrode/excalidraw/element/types';
import type { AppState } from '@atyrode/excalidraw/types';
import { MainMenuConfig } from './ui/MainMenu';
import { lockEmbeddables, renderCustomEmbeddable } from './CustomEmbeddableRenderer';
import AuthDialog from './ui/AuthDialog';
import BackupsModal from './ui/BackupsDialog';
import SettingsDialog from './ui/SettingsDialog';
import { capture } from './utils/posthog';
import { Footer } from '@atyrode/excalidraw';
import Tabs from './ui/Tabs';

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
  isAuthenticated?: boolean | null;
  isAuthLoading?: boolean;
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
  isAuthenticated = null,
  isAuthLoading = false,
}) => {
  // Add state for modal animation
  const [isExiting, setIsExiting] = useState(false);
  
  // State for modals
  const [showBackupsModal, setShowBackupsModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  // Handle auth state changes
  useEffect(() => {
    if (isAuthenticated === true) {
      setIsExiting(true);
      capture('signed_in');
    }
  }, [isAuthenticated]);
  
  
  // Handlers for closing modals
  const handleCloseBackupsModal = () => {
    setShowBackupsModal(false);
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
          {excalidrawAPI && (
          <Footer>
            <Tabs
              excalidrawAPI={excalidrawAPI}
            />
          </Footer>
        )}
        <MainMenuConfig 
          MainMenu={MainMenu} 
          excalidrawAPI={excalidrawAPI} 
          showBackupsModal={showBackupsModal}
          setShowBackupsModal={setShowBackupsModal}
          showSettingsModal={showSettingsModal}
          setShowSettingsModal={setShowSettingsModal}
        />
        {!isAuthLoading && isAuthenticated === false && (
          <AuthDialog 
            onClose={() => {}}
          />
        )}
        
        {showBackupsModal && (
          <BackupsModal
            excalidrawAPI={excalidrawAPI}
            onClose={handleCloseBackupsModal}
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
