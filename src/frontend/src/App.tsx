import React, { useState, useCallback, useEffect, useRef } from "react";
import { useCanvas, useDefaultCanvas, useUserProfile } from "./api/hooks";
import { ExcalidrawWrapper } from "./ExcalidrawWrapper";
import { debounce } from "./utils/debounce";
import { capture } from "./utils/posthog";
import posthog from "./utils/posthog";
import { useSaveCanvas } from "./api/hooks";
import type * as TExcalidraw from "@excalidraw/excalidraw";
import type { NonDeletedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI, AppState } from "@excalidraw/excalidraw/types";
import AuthModal from "./auth/AuthModal";
import { useAuthCheck } from "./api/hooks";

export interface AppProps {
  useCustom: (api: ExcalidrawImperativeAPI | null, customArgs?: any[]) => void;
  customArgs?: any[];
  children?: React.ReactNode;
  excalidrawLib: typeof TExcalidraw;
}

export default function App({
  useCustom,
  customArgs,
  children,
  excalidrawLib,
}: AppProps) {
  const { useHandleLibrary, MainMenu } = excalidrawLib;

  // Get authentication state from React Query
  const { data: isAuthenticated, isLoading: isAuthLoading } = useAuthCheck();

  // Get user profile for analytics identification
  const { data: userProfile } = useUserProfile();

  // Only enable canvas queries if authenticated and not loading
  const { data: canvasData } = useCanvas({
    queryKey: ['canvas'],
    enabled: isAuthenticated === true && !isAuthLoading,
    retry: 1,
  });

  // Excalidraw API ref
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  useCustom(excalidrawAPI, customArgs);
  useHandleLibrary({ excalidrawAPI });

  // On login and canvas data load, update the scene
  // Helper to ensure collaborators is a Map
  function normalizeCanvasData(data: any) {
    if (!data) return data;
    const appState = { ...data.appState };
    // Remove width and height so they get recomputed when loading from DB
    if ("width" in appState) {
      delete appState.width;
    }
    if ("height" in appState) {
      delete appState.height;
    }
    if (!(appState.collaborators instanceof Map)) {
      appState.collaborators = new Map();
    }
    return { ...data, appState };
  }

  useEffect(() => {
    if (excalidrawAPI && canvasData) {
      excalidrawAPI.updateScene(normalizeCanvasData(canvasData));
    }
  }, [excalidrawAPI, canvasData]);

  // Use React Query mutation for saving canvas
  const { mutate: saveCanvas } = useSaveCanvas({
    onSuccess: () => {
      console.debug("Canvas saved to database successfully");
      // Track canvas save event with PostHog
      capture('canvas_saved');
    },
    onError: (error) => {
      console.error("Failed to save canvas to database:", error);
      // Track canvas save failure
      capture('canvas_save_failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  useEffect(() => {
    if (excalidrawAPI) {
      (window as any).excalidrawAPI = excalidrawAPI;
      // Track application loaded event
      capture('app_loaded');
    }
    return () => {
      (window as any).excalidrawAPI = null;
    };
  }, [excalidrawAPI]);

  // Ref to store the last sent canvas data for change detection
  const lastSentCanvasDataRef = useRef<string>("");

  const debouncedLogChange = useCallback(
    debounce(
      (elements: NonDeletedExcalidrawElement[], state: AppState, files: any) => {
        // Only save if authenticated
        if (!isAuthenticated) return;

        const canvasData = {
          elements,
          appState: state,
          files
        };

        // Compare with last sent data (deep equality via JSON.stringify)
        const serialized = JSON.stringify(canvasData);
        if (serialized !== lastSentCanvasDataRef.current) {
          lastSentCanvasDataRef.current = serialized;
          // Use React Query mutation to save canvas
          saveCanvas(canvasData);
        }
      },
      1200
    ),
    [saveCanvas, isAuthenticated]
  );

  // Identify user in PostHog when username is available
  useEffect(() => {
    if (userProfile?.username) {
      posthog.identify(userProfile.username);
    }
  }, [userProfile?.username]);

  return (
    <>
      <ExcalidrawWrapper
        excalidrawAPI={excalidrawAPI}
        setExcalidrawAPI={setExcalidrawAPI}
        onChange={debouncedLogChange}
        MainMenu={MainMenu}
      >
        {children}
      </ExcalidrawWrapper>

      {/* AuthModal is now handled by AuthGate */}
    </>
  );
}
