import throttle from "lodash.throttle";
import type * as TExcalidraw from "@atyrode/excalidraw";
import { viewportCoordsToSceneCoords } from "@atyrode/excalidraw";
import type { NonDeletedExcalidrawElement } from "@atyrode/excalidraw/element/types";
import type { ExcalidrawImperativeAPI, AppState } from "@atyrode/excalidraw/types";

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
export const POINTER_MOVE_THROTTLE_MS = 100; // Throttle pointer move events to avoid spamming

/**
 * Function to detect which elements have changed
 * @param elements Current elements
 * @param previousElementsRef Reference to previous elements state
 * @returns Array of changed element IDs
 */
export const detectChangedElements = (
  elements: NonDeletedExcalidrawElement[],
  previousElementsRef: { current: { [id: string]: NonDeletedExcalidrawElement } }
): string[] => {
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

/**
 * Function to dispatch collaboration events
 * @param event The collaboration event to dispatch
 */
export const dispatchCollabEvent = (event: CollabEvent): void => {
  const collabEvent = new CustomEvent('collabEvent', {
    detail: event
  });
  document.dispatchEvent(collabEvent);
};

/**
 * Sets up collaboration event handlers for Excalidraw
 * @param excalidrawAPI The Excalidraw API instance
 * @returns Cleanup function to remove event listeners
 */
export const setupCollabEventHandlers = (
  excalidrawAPI: ExcalidrawImperativeAPI
): (() => void) => {
  if (!excalidrawAPI) return () => {};
  
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
  
  // Return cleanup function
  return () => {
    unsubPointerDown();
    unsubPointerUp();
    if (canvas) {
      canvas.removeEventListener("pointermove", handlePointerMove);
    }
    handlePointerMove.cancel(); // Cancel any pending throttled calls
  };
};

/**
 * Creates and dispatches an elements_changed collaboration event
 * @param elements Current elements
 * @param state Current app state
 * @param files Current files
 * @param changedElementIds IDs of elements that changed
 */
export const dispatchElementsChangedEvent = (
  elements: NonDeletedExcalidrawElement[],
  state: AppState,
  files: any,
  changedElementIds: string[]
): void => {
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
};
