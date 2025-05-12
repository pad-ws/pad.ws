import React, { useState, useEffect } from "react";
import { Excalidraw, MainMenu } from "@atyrode/excalidraw";
import { useAuthStatus } from "./hooks/useAuthStatus";
import type { ExcalidrawImperativeAPI, AppState } from "@atyrode/excalidraw/types";
import type { NonDeletedExcalidrawElement } from "@atyrode/excalidraw/element/types";

import DiscordButton from './ui/DiscordButton';
import GitHubButton from './ui/GitHubButton';
import { MainMenuConfig } from './ui/MainMenu';
import { lockEmbeddables, renderCustomEmbeddable } from './CustomEmbeddableRenderer';
import AuthDialog from './ui/AuthDialog';
import SettingsDialog from './ui/SettingsDialog';
// import { capture } from './utils/posthog';

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
  
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);

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
          {/* <GitHubButton /> //TODO */}
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
          onClose={() => {}}
        />
      )}

      {showSettingsModal && (
        <SettingsDialog
          excalidrawAPI={excalidrawAPI}
          onClose={handleCloseSettingsModal}
        />
      )}
    </Excalidraw>
  );
}
