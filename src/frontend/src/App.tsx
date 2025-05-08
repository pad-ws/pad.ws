import React, { useState, useCallback, useEffect, useRef } from "react";
import { useAllPads, useUserProfile } from "./api/hooks";
import { ExcalidrawWrapper } from "./ExcalidrawWrapper";
import { debounce } from "./lib/debounce";
import posthog from "./lib/posthog";
import { 
  detectChangedElements, 
  dispatchElementsAddedEvent,
  dispatchElementsEditedEvent,
  dispatchElementsDeletedEvent,
  dispatchAppStateChangedEvent,
  setupCollabEventHandlers,
  setRoomEmitterInfo,
} from "./lib/room";
import { 
  storePadData, 
  setActivePad, 
  getActivePad,
  getStoredActivePad,
  loadPadData
} from "./lib/canvas";
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

  // Track previous elements state to detect changes
  const previousElementsRef = useRef<{ [id: string]: NonDeletedExcalidrawElement }>({});
  
  // Track previous app state to detect changes
  const previousAppStateRef = useRef<AppState | null>(null);

  // Ref to track if it's the initial load, to prevent firing events before comparison is possible
  const isInitialLoadRef = useRef(true);

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

          // Handle initial load: set baseline previous states and skip event dispatch
          if (isInitialLoadRef.current) {
            // Populate previousElementsRef with initial elements (deep copy)
            const initialElementsMap: { [id: string]: NonDeletedExcalidrawElement } = {};
            elements.forEach(element => {
              if (!(element as any).isDeleted) { // Only non-deleted elements
                initialElementsMap[element.id] = JSON.parse(JSON.stringify(element));
              }
            });
            previousElementsRef.current = initialElementsMap;
            
            // Populate previousAppStateRef with initial state (deep copy)
            previousAppStateRef.current = JSON.parse(JSON.stringify(state));
            
            isInitialLoadRef.current = false;
            // Dispatch original event for backward compatibility even on initial load if needed by other parts
            const logChangeEventInit = new CustomEvent('debouncedLogChange', {
              detail: { elements, appState: state, files }
            });
            document.dispatchEvent(logChangeEventInit);
            return; // Skip event dispatching for elements/appstate changes on initial load
          }
          
          // Detect which elements have changed, categorized by type
          // previousElementsRef is updated inside detectChangedElements
          const { added, edited, deleted, deletedElements } = detectChangedElements(elements, previousElementsRef);
          
          // Dispatch specific events based on what changed
          if (added.length > 0) {
            dispatchElementsAddedEvent(elements, added);
          }
          
          if (edited.length > 0) {
            dispatchElementsEditedEvent(elements, edited);
          }
          
          if (deleted.length > 0) {
            dispatchElementsDeletedEvent(deleted, deletedElements);
          }
          
          // Dispatch appstate_changed event with current and previous state for diffing
          // previousAppStateRef.current was set in the previous run (or initial load)
          dispatchAppStateChangedEvent(state, previousAppStateRef.current);
          
          // Update previous app state reference with a deep copy for the next comparison
          previousAppStateRef.current = JSON.parse(JSON.stringify(state));
          
          // Dispatch original event for backward compatibility
          const logChangeEvent = new CustomEvent('debouncedLogChange', {
            detail: {
              elements,
              appState: state,
              files
            }
          });
          document.dispatchEvent(logChangeEvent);
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
      // Set emitter info for collaboration events
      setRoomEmitterInfo({ userId: userProfile.id });
    }
  }, [userProfile]);

  // Set up pointer event handlers when excalidrawAPI is available
  useEffect(() => {
    if (!excalidrawAPI) return;
    
    // Use the setupCollabEventHandlers function from room.ts
    const cleanup = setupCollabEventHandlers(excalidrawAPI);
    
    return cleanup;
  }, [excalidrawAPI]);

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
