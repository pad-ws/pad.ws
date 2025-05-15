import React, { useState, useEffect } from "react";
import { Excalidraw, MainMenu, Footer } from "@atyrode/excalidraw";
import { initializePostHog } from "./utils/posthog";
import { useAuthStatus } from "./hooks/useAuthStatus";
import { useAppConfig } from "./hooks/useAppConfig";
import type { ExcalidrawImperativeAPI, AppState } from "@atyrode/excalidraw/types";
import type { NonDeletedExcalidrawElement } from "@atyrode/excalidraw/element/types";
import TabBar from "./ui/TabBar";

import DiscordButton from './ui/DiscordButton';
import { MainMenuConfig } from './ui/MainMenu';
import { lockEmbeddables, renderCustomEmbeddable } from './CustomEmbeddableRenderer';
import AuthDialog from './ui/AuthDialog';
import SettingsDialog from './ui/SettingsDialog';

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

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);

  // Add state for tab management
  const [activeTabId, setActiveTabId] = useState('tab1');

  // Placeholder tabs data
  const tabs = [
    { id: 'tab1', label: 'Canvas 1' },
    { id: 'tab2', label: 'Canvas 2' },
    { id: 'tab3', label: 'Canvas 3' }
  ];

  const handleCloseSettingsModal = () => {
    setShowSettingsModal(false);
  };

  const handleOnChange = (elements: readonly NonDeletedExcalidrawElement[], state: AppState) => {
    // TODO
  };

  const handleOnScrollChange = (scrollX: number, scrollY: number) => {
    // TODO
    lockEmbeddables(excalidrawAPI?.getAppState());
  };

  useEffect(() => {
    if (appConfig && appConfig.posthogKey && appConfig.posthogHost) {
      initializePostHog({
        posthogKey: appConfig.posthogKey,
        posthogHost: appConfig.posthogHost,
      });
    } else if (configError) {
      console.error('[pad.ws] Failed to load app config, PostHog initialization might be skipped or delayed:', configError);
    }
  }, [appConfig, configError]);

  // TODO
  // useEffect(() => {
  //   if (userProfile?.id) {
  //     posthog.identify(userProfile.id);
  //     if (posthog.people && typeof posthog.people.set === "function") {
  //       const {
  //         id, // do not include in properties
  //         ...personProps
  //       } = userProfile;
  //       posthog.people.set(personProps);
  //     }
  //   }
  // }, [userProfile]);

  // Render Excalidraw directly with props and associated UI
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

        {isAuthenticated === false && (
          <AuthDialog
            onClose={() => { }}
          />
        )}

        {showSettingsModal && (
          <SettingsDialog
            excalidrawAPI={excalidrawAPI}
            onClose={handleCloseSettingsModal}
          />
        )}

        <Footer>
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onTabSelect={setActiveTabId}
          />
        </Footer>
      </Excalidraw>
    </>
  );
}
