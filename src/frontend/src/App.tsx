import React, { useState, useEffect } from "react";
import { Excalidraw, MainMenu, Footer } from "@atyrode/excalidraw";
import type { ExcalidrawImperativeAPI, AppState } from "@atyrode/excalidraw/types";
import type { ExcalidrawEmbeddableElement, NonDeleted } from "@atyrode/excalidraw/element/types";

// Hooks
import { useAuthStatus } from "./hooks/useAuthStatus";
import { usePadTabs } from "./hooks/usePadTabs";
import { useCallbackRefState } from "./hooks/useCallbackRefState";
import { useAppConfig } from "./hooks/useAppConfig";

// Components
import DiscordButton from './ui/DiscordButton';
import { MainMenuConfig } from './ui/MainMenu';
import AuthDialog from './ui/AuthDialog';
import SettingsDialog from './ui/SettingsDialog';
import Collab from './lib/collab/Collab';

// Utils
import { initializePostHog } from "./lib/posthog";
import { lockEmbeddables, renderCustomEmbeddable } from './CustomEmbeddableRenderer';
import Tabs from "./ui/Tabs";
import { INITIAL_APP_DATA, HIDDEN_UI_ELEMENTS } from "./constants";

export default function App() {
  const { config, configError } = useAppConfig();
  const { isAuthenticated, isLoading: isLoadingAuth, user } = useAuthStatus();

  const {
    tabs,
    selectedTabId,
    isLoading: isLoadingTabs,
    createNewPadAsync,
    isCreating: isCreatingPad,
    renamePad,
    deletePad,
    selectTab,
    updateSharingPolicy,
    leaveSharedPad
  } = usePadTabs(isAuthenticated);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [excalidrawAPI, excalidrawRefCallback] = useCallbackRefState<ExcalidrawImperativeAPI>();


  const handleCloseSettingsModal = () => {
    setShowSettingsModal(false);
  };

  const handleOnScrollChange = () => {
    lockEmbeddables(excalidrawAPI?.getAppState());
  };

  useEffect(() => {
    if (!config?.devMode && config?.posthogKey && config?.posthogHost) {
      initializePostHog({
        posthogKey: config.posthogKey,
        posthogHost: config.posthogHost,
      });
    } else if (configError) {
      console.error('[pad.ws] Failed to load app config:', configError);
    }
  }, [config, configError]);

  return (
    <>
      <Excalidraw
        excalidrawAPI={excalidrawRefCallback}
        initialData={INITIAL_APP_DATA}
        UIOptions={{
          hiddenElements: HIDDEN_UI_ELEMENTS,
        }}
        onScrollChange={handleOnScrollChange}
        validateEmbeddable={true}
        renderEmbeddable={(element: NonDeleted<ExcalidrawEmbeddableElement>, appState: AppState) => {
          return renderCustomEmbeddable(element, appState, excalidrawAPI);
        }}
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
            {isAuthenticated && (
              <Tabs
                excalidrawAPI={excalidrawAPI}
                tabs={tabs}
                selectedTabId={selectedTabId}
                isLoading={isLoadingTabs}
                isCreatingPad={isCreatingPad}
                createNewPadAsync={createNewPadAsync}
                renamePad={renamePad}
                deletePad={deletePad}
                leaveSharedPad={leaveSharedPad}
                updateSharingPolicy={updateSharingPolicy}
                selectTab={selectTab}
              />
            )}
          </Footer>
        )}
        {excalidrawAPI && user && (
          <Collab
            excalidrawAPI={excalidrawAPI}
            user={user}
            isOnline={!!isAuthenticated}
            isLoadingAuth={isLoadingAuth}
            padId={selectedTabId}
          />
        )}
      </Excalidraw>
    </>
  );
}
