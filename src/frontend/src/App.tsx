import React, { useState, useCallback, useEffect, useRef } from "react";
import { useAllPads, useUserProfile } from "./api/hooks";
import { ExcalidrawWrapper } from "./ExcalidrawWrapper";
import { debounce } from "./utils/debounce";
import posthog from "./utils/posthog";
import { 
  normalizeCanvasData, 
  getPadData, 
  storePadData, 
  setActivePad, 
  getActivePad,
  getStoredActivePad,
  loadPadData
} from "./utils/canvasUtils";
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

  // Only enable pad queries if authenticated and not loading
  const { data: pads } = useAllPads({
    queryKey: ['allPads'],
    enabled: isAuthenticated === true && !isAuthLoading,
    retry: 1,
  });
  
  // Get the first pad's data to use as the canvas data
  const canvasData = pads && pads.length > 0 ? pads[0].data : null;

  // Excalidraw API ref
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  useCustom(excalidrawAPI, customArgs);
  useHandleLibrary({ excalidrawAPI });

  // Using imported functions from canvasUtils.ts

  useEffect(() => {
    if (excalidrawAPI && pads && pads.length > 0) {
      // Check if there's a stored active pad ID
      const storedActivePadId = getStoredActivePad();
      
      // Find the pad that matches the stored ID, or use the first pad if no match
      let padToActivate = pads[0];
      
      if (storedActivePadId) {
        // Try to find the pad with the stored ID
        const matchingPad = pads.find(pad => pad.id === storedActivePadId);
        if (matchingPad) {
          console.debug(`[pad.ws] Found stored active pad in App.tsx: ${storedActivePadId}`);
          padToActivate = matchingPad;
        } else {
          console.debug(`[pad.ws] Stored active pad ${storedActivePadId} not found in available pads`);
        }
      }
      
      // Set the active pad ID globally
      setActivePad(padToActivate.id);
      
      // Load the pad data for the selected pad
      loadPadData(excalidrawAPI, padToActivate.id, padToActivate.data);
    }
  }, [excalidrawAPI, pads]);

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

        // Get the active pad ID using the imported function
        const activePadId = getActivePad();
        if (!activePadId) return;

        const canvasData = {
          elements,
          appState: state,
          files
        };

        const serialized = JSON.stringify(canvasData);
        if (serialized !== lastSentCanvasDataRef.current) {
          lastSentCanvasDataRef.current = serialized;
          
          // Store the canvas data in local storage
          storePadData(activePadId, canvasData);
          
          // Save the canvas data to the server
          saveCanvas(canvasData);
        }
      },
      1200
    ),
    [saveCanvas, isAuthenticated, storePadData]
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
        isAuthenticated={isAuthenticated}
        isAuthLoading={isAuthLoading}
      >
        {children}
      </ExcalidrawWrapper>

    </>
  );
}
