import throttle from "lodash.throttle";
import isEqual from "lodash.isequal";
import type * as TExcalidraw from "@atyrode/excalidraw";
import { viewportCoordsToSceneCoords } from "@atyrode/excalidraw";
import type { NonDeletedExcalidrawElement } from "@atyrode/excalidraw/element/types";
import type { ExcalidrawImperativeAPI, AppState } from "@atyrode/excalidraw/types";

/**
 * IMPORTANT NOTE ABOUT ELEMENT CHANGE DETECTION:
 * 
 * When storing previous elements for comparison, we must create deep copies
 * of the elements rather than storing references to the same objects.
 * Otherwise, when an element is modified, both the current and previous
 * references would point to the same updated object, making it impossible
 * to detect changes.
 * 
 * This is why we use JSON.parse(JSON.stringify()) to create deep copies
 * when updating previousElementsRef.current in the detectChangedElements function.
 */

// Define types for collaboration events
export type CollabEventType = 'pointer_down' | 'pointer_up' | 'pointer_move' | 'elements_added' | 'elements_edited' | 'elements_deleted' | 'appstate_changed';

export interface EmitterInfo {
  userId: string;
  // We can add username or other fields later if needed
}

export interface CollabEvent {
  type: CollabEventType;
  timestamp: number;
  emitter?: EmitterInfo;
  pointer?: { x: number; y: number }; // Canvas-relative coordinates
  button?: string;
  elements?: NonDeletedExcalidrawElement[];
  appState?: Partial<AppState>;
  files?: any;
  changedElementIds?: string[];
}

// Module-scoped variable to store emitter information
let currentEmitterInfo: EmitterInfo | null = null;

/**
 * Sets the emitter information for subsequent collaboration events.
 * @param emitterInfo The information about the user emitting the events.
 */
export const setRoomEmitterInfo = (emitterInfo: EmitterInfo): void => {
  currentEmitterInfo = emitterInfo;
  // console.log("[pad.ws] Emitter info for room events updated:", currentEmitterInfo);
};

// Constants for throttling
export const POINTER_MOVE_THROTTLE_MS = 100; // Throttle pointer move events to avoid spamming

/**
 * Function to detect which elements have changed, categorized by type of change
 * @param elements Current elements
 * @param previousElementsRef Reference to previous elements state
 * @returns Object containing arrays of added, edited, and deleted elements
 */
export const detectChangedElements = (
  elements: NonDeletedExcalidrawElement[],
  previousElementsRef: { current: { [id: string]: NonDeletedExcalidrawElement } }
): {
  added: string[];
  edited: string[];
  deleted: string[];
  deletedElements: any[]; // Store the actual deleted element data
} => {
  const added: string[] = [];
  const edited: string[] = [];
  const deleted: string[] = [];
  const deletedElements: any[] = [];
  const currentElementsMap: { [id: string]: NonDeletedExcalidrawElement } = {};
  
  // Detect added and edited elements
  elements.forEach(element => {
    // In Excalidraw, deleted elements have isDeleted=true but remain in the array
    // We need to check for this flag to properly categorize elements
    if ((element as any).isDeleted) {
      // This is a deleted element that's still in the array
      // Check if it was in the previous state and not already marked as deleted
      const prevElement = previousElementsRef.current[element.id];
      if (prevElement && !(prevElement as any).isDeleted) {
        deleted.push(element.id);
        // Store the deleted element data (using the previous state's data)
        deletedElements.push({
          ...prevElement,
          id: element.id
        });
      }
      // Don't add deleted elements to the currentElementsMap
      return;
    }
    
    currentElementsMap[element.id] = element;
    
    const prevElement = previousElementsRef.current[element.id];
    if (!prevElement) {
      console.log("[pad.ws] Element added", element.id);
      // Element didn't exist before - it's new
      added.push(element.id);
    } else if (prevElement.version !== element.version) {
      // Element existed but version changed - it's edited
      console.log("[pad.ws] Element edited", element.id, "version:", element.version, "prev version:", prevElement.version);
      edited.push(element.id);
    } else if (prevElement.x !== element.x || prevElement.y !== element.y) {
      // Position changed but version didn't - this shouldn't happen after our fix
      // but we'll check for it anyway and log it
      console.log("[pad.ws] Element position changed but version didn't!", 
        element.id, 
        "version:", element.version, 
        "position:", element.x, element.y, 
        "prev position:", prevElement.x, prevElement.y);
      
      // Since we detected a change, we'll add it to edited anyway
      edited.push(element.id);
    } else {
      console.log("[pad.ws] Element unchanged", 
        element.id, 
        "version:", element.version, 
        "prev version:", prevElement.version, 
        "position:", element.x, element.y, 
        "prev position:", prevElement.x, prevElement.y);
    }
  });
  
  // Detect deleted elements (elements that were in previous state but not in current state)
  Object.keys(previousElementsRef.current).forEach(id => {
    if (!currentElementsMap[id] && !deleted.includes(id)) {
      deleted.push(id);
      // Store the deleted element data
      deletedElements.push({
        ...previousElementsRef.current[id],
        id
      });
    }
  });
  
  // Update previous elements ref with deep copies of non-deleted elements
  // This ensures we don't store references to the same objects
  const deepCopiedElementsMap: { [id: string]: NonDeletedExcalidrawElement } = {};
  
  Object.keys(currentElementsMap).forEach(id => {
    // Create a deep copy of each element to avoid reference issues
    deepCopiedElementsMap[id] = JSON.parse(JSON.stringify(currentElementsMap[id]));
  });
  
  previousElementsRef.current = deepCopiedElementsMap;
  
  return { added, edited, deleted, deletedElements };
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
      emitter: currentEmitterInfo ?? undefined,
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
      emitter: currentEmitterInfo ?? undefined,
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
      emitter: currentEmitterInfo ?? undefined,
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
 * Creates and dispatches an elements_added collaboration event
 * @param elements Current elements
 * @param addedElementIds IDs of elements that were added
 */
export const dispatchElementsAddedEvent = (
  elements: NonDeletedExcalidrawElement[],
  addedElementIds: string[]
): void => {
  // Filter to only include added elements
  const addedElements = elements.filter(el => addedElementIds.includes(el.id));
  
  const collabEvent: CollabEvent = {
    type: 'elements_added',
    timestamp: Date.now(),
    emitter: currentEmitterInfo ?? undefined,
    elements: addedElements,
    changedElementIds: addedElementIds
  };
  
  dispatchCollabEvent(collabEvent);
};

/**
 * Creates and dispatches an elements_edited collaboration event
 * @param elements Current elements
 * @param editedElementIds IDs of elements that were edited
 */
export const dispatchElementsEditedEvent = (
  elements: NonDeletedExcalidrawElement[],
  editedElementIds: string[]
): void => {
  // Filter to only include edited elements
  const editedElements = elements.filter(el => editedElementIds.includes(el.id));
  
  const collabEvent: CollabEvent = {
    type: 'elements_edited',
    timestamp: Date.now(),
    emitter: currentEmitterInfo ?? undefined,
    elements: editedElements,
    changedElementIds: editedElementIds
  };
  
  dispatchCollabEvent(collabEvent);
};

/**
 * Creates and dispatches an elements_deleted collaboration event
 * @param deletedElementIds IDs of elements that were deleted
 * @param deletedElements The actual deleted element data
 */
export const dispatchElementsDeletedEvent = (
  deletedElementIds: string[],
  deletedElements: any[]
): void => {
  const collabEvent: CollabEvent = {
    type: 'elements_deleted',
    timestamp: Date.now(),
    emitter: currentEmitterInfo ?? undefined,
    changedElementIds: deletedElementIds,
    elements: deletedElements
  };
  
  dispatchCollabEvent(collabEvent);
};

/**
 * Creates and dispatches an appstate_changed collaboration event
 * @param state Current app state
 */
export const dispatchAppStateChangedEvent = (
  currentState: AppState,
  previousState: AppState | null
): void => {
  // If there's no previous state, it's the initial load, so don't dispatch anything.
  if (!previousState) {
    return;
  }

  const changedAppState: Partial<AppState> = {};

  // Compare current state with previous state
  for (const key in currentState) {
      if (key === 'collaborators') {
        continue; // Always exclude collaborators key
      }
      if (Object.prototype.hasOwnProperty.call(currentState, key)) {
        const currentVal = (currentState as any)[key];
        const previousVal = (previousState as any)[key];

        if (!Object.prototype.hasOwnProperty.call(previousState, key) || !isEqual(currentVal, previousVal)) {
          (changedAppState as any)[key] = currentVal;
        }
      }
    }
    // Check for keys in previousState that are not in currentState (though AppState changes usually add/modify)
    // This part might be less common for AppState but included for completeness if properties could be removed.
    // However, Excalidraw's AppState typically doesn't remove top-level keys, it changes their values.
    // If a key was removed, it wouldn't be in `currentState` to iterate over.
    // If a key's value becomes `undefined`, `isEqual` should handle it.

  // Only dispatch if there are actual changes
  if (Object.keys(changedAppState).length > 0) {
    const collabEvent: CollabEvent = {
      type: 'appstate_changed',
      timestamp: Date.now(),
      emitter: currentEmitterInfo ?? undefined,
      appState: changedAppState, // Send only the diff
    };
    dispatchCollabEvent(collabEvent);
  }
};
