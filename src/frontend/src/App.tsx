import React, { useState, useCallback, useEffect, useRef } from "react";
import { useCanvas, useDefaultCanvas, useUserProfile } from "./api/hooks";
import { ExcalidrawWrapper } from "./ExcalidrawWrapper";
import { debounce } from "./utils/debounce";
import { capture } from "./utils/posthog";
import posthog from "./utils/posthog";
import { useSaveCanvas } from "./api/hooks";
import type * as TExcalidraw from "@atyrode/excalidraw";
import type { NonDeletedExcalidrawElement } from "@atyrode/excalidraw/element/types";
import type { ExcalidrawImperativeAPI, AppState } from "@atyrode/excalidraw/types";
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

  const { data: isAuthenticated, isLoading: isAuthLoading } = useAuthCheck();
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

  function normalizeCanvasData(data: any) {
    if (!data) return data;
    const appState = { ...data.appState };
    appState.width = undefined;
    if ("width" in appState) {
      delete appState.width;
    }
    if ("height" in appState) {
      delete appState.height;
    }
    appState.collaborators = new Map();
    return { ...data, appState };
  }

  useEffect(() => {
    if (excalidrawAPI && canvasData) {
      excalidrawAPI.updateScene(normalizeCanvasData(canvasData));
    }
  }, [excalidrawAPI, canvasData]);

  const { mutate: saveCanvas } = useSaveCanvas({
    onSuccess: () => {
      console.debug("[pad.ws] Canvas saved to database successfully");
    },
    onError: (error) => {
      console.error("[pad.ws] Failed to save canvas to database:", error);
    }
  });

  useEffect(() => {
    if (excalidrawAPI) {
      (window as any).excalidrawAPI = excalidrawAPI;
      capture('app_loaded');
    }
    return () => {
      (window as any).excalidrawAPI = null;
    };
  }, [excalidrawAPI]);

  const lastSentCanvasDataRef = useRef<string>("");

  const debouncedLogChange = useCallback(
    debounce(
      (elements: NonDeletedExcalidrawElement[], state: AppState, files: any) => {
        if (!isAuthenticated) return;

        const canvasData = {
          elements,
          appState: state,
          files
        };

        const serialized = JSON.stringify(canvasData);
        if (serialized !== lastSentCanvasDataRef.current) {
          lastSentCanvasDataRef.current = serialized;
          saveCanvas(canvasData);
        }
      },
      1200
    ),
    [saveCanvas, isAuthenticated]
  );

  useEffect(() => {
    if (userProfile?.id) {
      posthog.identify(userProfile.id);
      if (posthog.people && typeof posthog.people.set === "function") {
        const {
          id, // do not include in properties
          ...personProps
        } = userProfile;
        posthog.people.set(personProps);
      }
    }
  }, [userProfile]);

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

    </>
  );
}
