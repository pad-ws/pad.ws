import React, { Children, cloneElement, useState, useEffect, CSSProperties } from 'react';
import { setupCollabEventReceiver, getRemoteCursors, RemoteCursor } from './lib/room'; // Added for collab event receiving
import { sceneCoordsToViewportCoords } from '@atyrode/excalidraw'; // Use the project's consistent excalidraw package
import DiscordButton from './ui/DiscordButton';
import GitHubButton from './ui/GitHubButton';
import CollabButton from './ui/CollabButton'; // Import the new CollabButton
import type { ExcalidrawImperativeAPI } from '@atyrode/excalidraw/types';
import type { NonDeletedExcalidrawElement } from '@atyrode/excalidraw/element/types';
import type { AppState } from '@atyrode/excalidraw/types';
import { MainMenuConfig } from './ui/MainMenu';
import { lockEmbeddables, renderCustomEmbeddable } from './CustomEmbeddableRenderer';
import AuthDialog from './ui/AuthDialog';
import BackupsModal from './ui/BackupsDialog';
import PadsDialog from './ui/PadsDialog';
import SettingsDialog from './ui/SettingsDialog';
import { capture } from './lib/posthog';
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
  const [remoteCursorsToDisplay, setRemoteCursorsToDisplay] = useState<Map<string, RemoteCursor>>(new Map());

  // Effect to setup collaboration event receiver and remote cursor updates
  useEffect(() => {
    let cleanupEventReceiver: (() => void) | undefined;
    if (excalidrawAPI) {
      cleanupEventReceiver = setupCollabEventReceiver(excalidrawAPI);
      // console.log('[ExcalidrawWrapper] Collab event receiver set up.');
    }

    const handleRemoteCursorsUpdate = (event: Event) => {
      if (event instanceof CustomEvent && event.detail) {
        setRemoteCursorsToDisplay(new Map(event.detail));
      }
    };

    document.addEventListener('remoteCursorsUpdated', handleRemoteCursorsUpdate);
    // console.log('[ExcalidrawWrapper] Listening for remoteCursorsUpdated.');

    // Initial fetch of cursors, in case some were set before this component mounted/listened
    setRemoteCursorsToDisplay(getRemoteCursors());

    return () => {
      if (cleanupEventReceiver) {
        cleanupEventReceiver();
        // console.log('[ExcalidrawWrapper] Collab event receiver cleaned up.');
      }
      document.removeEventListener('remoteCursorsUpdated', handleRemoteCursorsUpdate);
      // console.log('[ExcalidrawWrapper] Stopped listening for remoteCursorsUpdated.');
    };
  }, [excalidrawAPI]);
  
  // State for modals
  const [showBackupsModal, setShowBackupsModal] = useState(false);
  const [showPadsModal, setShowPadsModal] = useState(false);
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
            <CollabButton excalidrawAPI={excalidrawAPI} />
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
          showPadsModal={showPadsModal}
          setShowPadsModal={setShowPadsModal}
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
        
        {showPadsModal && (
          <PadsDialog
            excalidrawAPI={excalidrawAPI}
            onClose={handleClosePadsModal}
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

  // Function to render remote cursors
  const renderRemoteCursors = () => {
    if (!excalidrawAPI) return null;

    const appState = excalidrawAPI.getAppState();
    const cursorsArray: React.JSX.Element[] = [];

    remoteCursorsToDisplay.forEach((cursor, userId) => {
      const { x: viewportX, y: viewportY } = sceneCoordsToViewportCoords(
        { sceneX: cursor.x, sceneY: cursor.y },
        appState
      );

      const cursorStyle: CSSProperties = {
        position: 'absolute',
        left: `${viewportX}px`,
        top: `${viewportY}px`,
        // transform: 'translate(-50%, -50%)', // Centering might depend on the cursor image/shape. Let's start without it or adjust.
                                                // The default Excalidraw cursor is top-left aligned.
        backgroundColor: 'rgba(0, 120, 255, 0.7)', // Example color
        color: 'white',
        padding: '2px 5px',
        borderRadius: '3px',
        fontSize: '10px',
        whiteSpace: 'nowrap',
        pointerEvents: 'none', // So they don't interfere with Excalidraw's events
        zIndex: 10000, // Ensure they are on top
      };

      cursorsArray.push(
        <div key={userId} style={cursorStyle} className="remote-user-cursor">
          {/* Simple dot for cursor position */}
          <div style={{
            width: '8px',
            height: '8px',
            backgroundColor: 'blue', // Or a user-specific color
            borderRadius: '50%',
            position: 'absolute',
            top: '-4px', // Adjust based on cursor shape
            left: '-4px', // Adjust based on cursor shape
          }}></div>
          <span style={{ marginLeft: '10px' }}>{cursor.displayName}</span>
        </div>
      );
    });
    return cursorsArray;
  };


  return (
    <div className="excalidraw-wrapper" style={{ position: 'relative' }}> {/* Ensure wrapper is a positioning context */}
      {renderExcalidraw(children)}
      {excalidrawAPI && renderRemoteCursors()}
    </div>
  );
};
