import { useEffect } from "react";
import { Excalidraw, MainMenu, Footer } from "@atyrode/excalidraw";
import type { ExcalidrawImperativeAPI, AppState } from "@atyrode/excalidraw/types";
import type { ExcalidrawEmbeddableElement, NonDeleted } from "@atyrode/excalidraw/element/types";

// Hooks
import { useAuthStatus } from "./hooks/useAuthStatus";
import { PadTabsProvider } from "./contexts/PadTabsContext";
import { useCallbackRefState } from "./hooks/useCallbackRefState";
import { useAppConfig } from "./hooks/useAppConfig";

// Components
import DiscordButton from './ui/DiscordButton';
import { MainMenuConfig } from './ui/MainMenu';
import AuthDialog from './ui/AuthDialog';
import Collab from './lib/collab/Collab';

// Utils
import { initializePostHog } from "./lib/posthog";
import { lockEmbeddables, renderCustomEmbeddable } from './CustomEmbeddableRenderer';
import { INITIAL_APP_DATA, HIDDEN_UI_ELEMENTS } from "./constants";
import PadTabs from "./ui/PadTabs";

export default function App() {
  const { config, configError } = useAppConfig();
  const { isAuthenticated, isLoading: isLoadingAuth, user } = useAuthStatus();

  const [excalidrawAPI, excalidrawRefCallback] = useCallbackRefState<ExcalidrawImperativeAPI>();

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
      <PadTabsProvider isAuthenticated={isAuthenticated}>
        <Excalidraw
          excalidrawAPI={excalidrawRefCallback}
          initialData={INITIAL_APP_DATA}
          UIOptions={{
            hiddenElements: HIDDEN_UI_ELEMENTS,
          }}
          onScrollChange={() => lockEmbeddables(excalidrawAPI?.getAppState())}
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
        />

        {!isLoadingAuth && !isAuthenticated && (
          <AuthDialog />
        )}

        {excalidrawAPI && (
          <Footer>
            {isAuthenticated && (
              <PadTabs excalidrawAPI={excalidrawAPI} />
            )}
          </Footer>
        )}
        {excalidrawAPI && user && (
          <Collab
            excalidrawAPI={excalidrawAPI}
            user={user}
            isOnline={!!isAuthenticated}
            isLoadingAuth={isLoadingAuth}
          />
        )}
        </Excalidraw>
      </PadTabsProvider>
    </>
  );
}
