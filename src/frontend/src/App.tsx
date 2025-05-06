import React, { useState, useCallback, useEffect, useRef } from "react";
import { useAllPads, useUserProfile } from "./api/hooks";
import { ExcalidrawWrapper } from "./ExcalidrawWrapper";
import { debounce } from "./lib/debounce";
import throttle from "lodash.throttle";
import posthog from "./lib/posthog";
import { 
  storePadData, 
  setActivePad, 
  getActivePad,
  getStoredActivePad,
  loadPadData
} from "./lib/canvas";
import { useSaveCanvas } from "./api/hooks";
import type * as TExcalidraw from "@atyrode/excalidraw";
import { viewportCoordsToSceneCoords } from "@atyrode/excalidraw";
import type { NonDeletedExcalidrawElement } from "@atyrode/excalidraw/element/types";
import type { ExcalidrawImperativeAPI, AppState } from "@atyrode/excalidraw/types";
import { useAuthCheck } from "./api/hooks";

// Define types for collaboration events
export type CollabEventType = 'pointer_down' | 'pointer_up' | 'pointer_move' | 'elements_changed';

export interface CollabEvent {
  type: CollabEventType;
  timestamp: number;
  pointer?: { x: number; y: number }; // Canvas-relative coordinates
  button?: string;
  elements?: NonDeletedExcalidrawElement[];
  appState?: Partial<AppState>;
  files?: any;
  changedElementIds?: string[];
}

// Constants for throttling
const POINTER_MOVE_THROTTLE_MS = 100; // Throttle pointer move events to avoid spamming

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

  // Track previous elements state to detect changes
  const previousElementsRef = useRef<{ [id: string]: NonDeletedExcalidrawElement }>({});
  
  // Function to detect which elements have changed
  const detectChangedElements = (elements: NonDeletedExcalidrawElement[]): string[] => {
    const changedIds: string[] = [];
    const currentElementsMap: { [id: string]: NonDeletedExcalidrawElement } = {};
    
    // Build current elements map and detect changes
    elements.forEach(element => {
      currentElementsMap[element.id] = element;
      
      const prevElement = previousElementsRef.current[element.id];
      if (!prevElement || prevElement.version !== element.version) {
        changedIds.push(element.id);
      }
    });
    
    // Check for deleted elements
    Object.keys(previousElementsRef.current).forEach(id => {
      if (!currentElementsMap[id]) {
        changedIds.push(id);
      }
    });
    
    // Update previous elements ref
    previousElementsRef.current = currentElementsMap;
    
    return changedIds;
  };

  // Function to dispatch collaboration events
  const dispatchCollabEvent = (event: CollabEvent) => {
    const collabEvent = new CustomEvent('collabEvent', {
      detail: event
    });
    document.dispatchEvent(collabEvent);
  };

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
          
          // Detect which elements have changed
          const changedElementIds = detectChangedElements(elements);
          
          // Create and dispatch collaboration event
          const collabEvent: CollabEvent = {
            type: 'elements_changed',
            timestamp: Date.now(),
            elements,
            appState: state,
            files,
            changedElementIds
          };
          
          dispatchCollabEvent(collabEvent);
          
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
    }
  }, [userProfile]);

  // Set up pointer event handlers when excalidrawAPI is available
  useEffect(() => {
    if (!excalidrawAPI) return;
    
    // Convert viewport coordinates to scene coordinates
    const convertToSceneCoords = (
      clientX: number,
      clientY: number,
      appState: AppState
    ) => {
      return viewportCoordsToSceneCoords(
        { clientX, clientY }, // Using correct property names as expected by the function
        appState
      );
    };
    
    // Handle pointer down events
    const handlePointerDown = (
      activeTool: AppState["activeTool"],
      pointerDownState: any,
      event: React.PointerEvent<HTMLElement>
    ) => {
      if (!excalidrawAPI) return;
      
      // Convert window coordinates to canvas coordinates
      const sceneCoords = convertToSceneCoords(
        event.clientX,
        event.clientY,
        excalidrawAPI.getAppState()
      );
      
      const collabEvent: CollabEvent = {
        type: 'pointer_down',
        timestamp: Date.now(),
        pointer: sceneCoords,
        button: event.button === 0 ? 'left' : event.button === 1 ? 'middle' : 'right'
      };
      
      dispatchCollabEvent(collabEvent);
    };
    
    // Handle pointer up events
    const handlePointerUp = (
      activeTool: AppState["activeTool"],
      pointerDownState: any,
      event: PointerEvent
    ) => {
      if (!excalidrawAPI) return;
      
      // Convert window coordinates to canvas coordinates
      const sceneCoords = convertToSceneCoords(
        event.clientX,
        event.clientY,
        excalidrawAPI.getAppState()
      );
      
      const collabEvent: CollabEvent = {
        type: 'pointer_up',
        timestamp: Date.now(),
        pointer: sceneCoords,
        button: event.button === 0 ? 'left' : event.button === 1 ? 'middle' : 'right'
      };
      
      dispatchCollabEvent(collabEvent);
    };
    
    // Throttled handler for pointer move events to avoid spamming
    const handlePointerMove = throttle((event: PointerEvent) => {
      if (!excalidrawAPI) return;
      
      // Convert window coordinates to canvas coordinates
      const sceneCoords = convertToSceneCoords(
        event.clientX,
        event.clientY,
        excalidrawAPI.getAppState()
      );
      
      const collabEvent: CollabEvent = {
        type: 'pointer_move',
        timestamp: Date.now(),
        pointer: sceneCoords
      };
      
      dispatchCollabEvent(collabEvent);
    }, POINTER_MOVE_THROTTLE_MS);
    
    // Add pointer move listener to the excalidraw wrapper or container
    // Try multiple selectors to ensure we find the right element
    const canvas = 
      document.querySelector(".excalidraw-wrapper") || 
      document.querySelector(".excalidraw-container") || 
      document.querySelector(".excalidraw");
    
    if (canvas) {
      console.debug("[pad.ws] Attaching pointer move listener to", canvas);
      canvas.addEventListener("pointermove", handlePointerMove);
    } else {
      console.warn("[pad.ws] Could not find excalidraw canvas element for pointer move events");
    }
    
    // Subscribe to pointer events
    const unsubPointerDown = excalidrawAPI.onPointerDown(handlePointerDown);
    const unsubPointerUp = excalidrawAPI.onPointerUp(handlePointerUp);
    
    return () => {
      unsubPointerDown();
      unsubPointerUp();
      if (canvas) {
        canvas.removeEventListener("pointermove", handlePointerMove);
      }
      handlePointerMove.cancel(); // Cancel any pending throttled calls
    };
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
