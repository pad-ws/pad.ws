import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Excalidraw, MainMenu, Footer } from "@atyrode/excalidraw";
import type { ExcalidrawImperativeAPI, AppState, Collaborator as ExcalidrawCollaborator } from "@atyrode/excalidraw/types"; // Added Collaborator
import type { ExcalidrawEmbeddableElement, NonDeleted, NonDeletedExcalidrawElement } from "@atyrode/excalidraw/element/types";

// Hooks
import { useAuthStatus } from "./hooks/useAuthStatus";
import { usePadTabs } from "./hooks/usePadTabs";
import { usePadWebSocket } from "./hooks/usePadWebSocket";

// Components
import DiscordButton from './ui/DiscordButton';
import { MainMenuConfig } from './ui/MainMenu';
import AuthDialog from './ui/AuthDialog';
import SettingsDialog from './ui/SettingsDialog';
import Collab from './lib/collab/Collab'; // Updated import path

// Utils
// import { initializePostHog } from "./lib/posthog";
import { lockEmbeddables, renderCustomEmbeddable } from './CustomEmbeddableRenderer';
import Tabs from "./ui/Tabs";

export const defaultInitialData = {
  elements: [],
  appState: {
    gridModeEnabled: true,
    gridSize: 20,
    gridStep: 5,
  },
  files: {},
};

export default function App() {
  const { isAuthenticated, isLoading: isLoadingAuth, user } = useAuthStatus(); // Changed userProfile to user

  const {
    tabs,
    selectedTabId,
    isLoading: isLoadingTabs,
    createNewPadAsync,
    isCreating: isCreatingPad,
    renamePad,
    deletePad,
    selectTab,
    updateSharingPolicy
  } = usePadTabs();

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);

  const { sendMessage, lastJsonMessage, connectionStatus } = usePadWebSocket(selectedTabId);

  const handleCloseSettingsModal = () => {
    setShowSettingsModal(false);
  };

  const handleOnScrollChange = (scrollX: number, scrollY: number) => {
    lockEmbeddables(excalidrawAPI?.getAppState());
  };

  // useEffect(() => {
  //   if (appConfig?.posthogKey && appConfig?.posthogHost) {
  //     initializePostHog({
  //       posthogKey: appConfig.posthogKey,
  //       posthogHost: appConfig.posthogHost,
  //     });
  //   } else if (configError) {
  //     console.error('[pad.ws] Failed to load app config:', configError);
  //   }
  // }, [appConfig, configError]);

  return (
    <>
      <Excalidraw
        excalidrawAPI={(api: ExcalidrawImperativeAPI) => setExcalidrawAPI(api)}
        theme="dark"
        initialData={defaultInitialData}
        name="Pad.ws"
        onScrollChange={handleOnScrollChange}
        validateEmbeddable={true}
        renderEmbeddable={(element: NonDeleted<ExcalidrawEmbeddableElement>, appState: AppState) => renderCustomEmbeddable(element, appState, excalidrawAPI)}
        renderTopRightUI={() => (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <DiscordButton />
          </div>
        )}
      >
        <MainMenuConfig
          MainMenu={MainMenu}
          excalidrawAPI={excalidrawAPI}
          showSettingsModal={showSettingsModal}
          setShowSettingsModal={setShowSettingsModal}
        />

        {!isLoadingAuth && !isAuthenticated && (
          <AuthDialog onClose={() => { }} />
        )}

        {showSettingsModal && (
          <SettingsDialog
            excalidrawAPI={excalidrawAPI}
            onClose={handleCloseSettingsModal}
          />
        )}

        {excalidrawAPI && (
          <Footer>
            <Tabs
              excalidrawAPI={excalidrawAPI}
              tabs={tabs}
              selectedTabId={selectedTabId}
              isLoading={isLoadingTabs}
              isCreatingPad={isCreatingPad}
              createNewPadAsync={createNewPadAsync}
              renamePad={renamePad}
              deletePad={deletePad}
              updateSharingPolicy={updateSharingPolicy}
              selectTab={selectTab}
            />
          </Footer>
        )}
        {excalidrawAPI && user && (
          <Collab
            excalidrawAPI={excalidrawAPI}
            lastJsonMessage={lastJsonMessage}
            user={user}
            sendMessage={sendMessage}
            isOnline={connectionStatus === 'Open'}
            padId={selectedTabId} // Pass selectedTabId as padId
          />
        )}
      </Excalidraw>
    </>
  );
}
