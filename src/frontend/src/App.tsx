import React, { useState, useEffect } from "react";
import { Excalidraw, MainMenu, Footer } from "@atyrode/excalidraw";
import type { ExcalidrawImperativeAPI, AppState } from "@atyrode/excalidraw/types";
import type { NonDeletedExcalidrawElement } from "@atyrode/excalidraw/element/types";

// Hooks
import { useAuthStatus } from "./hooks/useAuthStatus";
import { useAppConfig } from "./hooks/useAppConfig";
import { usePadTabs } from "./hooks/usePadTabs";
import { usePad } from "./hooks/usePadData";

// Components
import TabBar from "./ui/TabBar";
import DiscordButton from './ui/DiscordButton';
import { MainMenuConfig } from './ui/MainMenu';
import AuthDialog from './ui/AuthDialog';
import SettingsDialog from './ui/SettingsDialog';

// Utils
import { initializePostHog } from "./utils/posthog";
import { lockEmbeddables, renderCustomEmbeddable } from './CustomEmbeddableRenderer';

const defaultInitialData = {
  elements: [],
  appState: {
    gridModeEnabled: true,
    gridSize: 20,
    gridStep: 5,
    pad: {
      moduleBorderOffset: {
        top: 40,
        right: 5,
        bottom: 5,
        left: 5,
      },
    },
  },
  files: {},
};

export default function App() {
  const { isAuthenticated } = useAuthStatus();
  const { config: appConfig, isLoadingConfig, configError } = useAppConfig();
  const {
    tabs,
    selectedTabId,
    isLoading: isLoadingTabs,
    createNewPad,
    isCreating,
    selectTab
  } = usePadTabs();

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);

  const { padData } = usePad(selectedTabId, excalidrawAPI);

  const handleCloseSettingsModal = () => {
    setShowSettingsModal(false);
  };

  const handleOnChange = (elements: readonly NonDeletedExcalidrawElement[], state: AppState) => {
    // TODO: Implement change handling
  };

  const handleOnScrollChange = (scrollX: number, scrollY: number) => {
    lockEmbeddables(excalidrawAPI?.getAppState());
  };

  const handleTabSelect = async (tabId: string) => {
    await selectTab(tabId);
  };

  useEffect(() => {
    if (appConfig?.posthogKey && appConfig?.posthogHost) {
      initializePostHog({
        posthogKey: appConfig.posthogKey,
        posthogHost: appConfig.posthogHost,
      });
    } else if (configError) {
      console.error('[pad.ws] Failed to load app config:', configError);
    }
  }, [appConfig, configError]);

  return (
    <>
      <Excalidraw
        excalidrawAPI={(api: ExcalidrawImperativeAPI) => setExcalidrawAPI(api)}
        theme="dark"
        initialData={defaultInitialData}
        onChange={handleOnChange}
        name="Pad.ws"
        onScrollChange={handleOnScrollChange}
        validateEmbeddable={true}
        renderEmbeddable={(element, appState) => renderCustomEmbeddable(element, appState, excalidrawAPI)}
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

        {!isAuthenticated && (
          <AuthDialog onClose={() => { }} />
        )}

        {showSettingsModal && (
          <SettingsDialog
            excalidrawAPI={excalidrawAPI}
            onClose={handleCloseSettingsModal}
          />
        )}

        <Footer>
          <TabBar
            tabs={tabs.map(tab => ({ id: tab.id, label: tab.title }))}
            activeTabId={selectedTabId}
            onTabSelect={handleTabSelect}
            onNewTab={createNewPad}
          />
        </Footer>
      </Excalidraw>
    </>
  );
}
