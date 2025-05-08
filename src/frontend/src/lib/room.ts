import throttle from "lodash.throttle";
import isEqual from "lodash.isequal";
import type * as TExcalidraw from "@atyrode/excalidraw";
import {
  viewportCoordsToSceneCoords,
  restoreElements,
  reconcileElements,
  getSceneVersion, // Import this utility
} from "@atyrode/excalidraw";
import type {
  NonDeletedExcalidrawElement,
  ExcalidrawElement,
  // RemoteExcalidrawElement, // Removed as it's not exported; ExcalidrawElement will be used
} from "@atyrode/excalidraw/element/types";
import type { ExcalidrawImperativeAPI, AppState } from "@atyrode/excalidraw/types";

// Module-scoped variable to store the version of the last scene state
// that was either broadcasted by this client or received from the server and applied.
let lastProcessedSceneVersion: number = -1;

/**
 * Updates the last processed scene version.
 * @param elements The elements based on which the scene version is determined.
 */
export const updateLastProcessedSceneVersion = (elements: readonly ExcalidrawElement[]): void => {
  lastProcessedSceneVersion = getSceneVersion(elements);
  // console.log("[pad.ws] Last processed scene version updated to:", lastProcessedSceneVersion);
};

/**
 * Gets the last processed scene version.
 * @returns The last processed scene version.
 */
export const getLastProcessedSceneVersion = (): number => {
  return lastProcessedSceneVersion;
};

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
export type CollabEventType = 'pointer_down' | 'pointer_up' | 'pointer_move' | 'cursor_position_update' | 'elements_added' | 'elements_edited' | 'elements_deleted' | 'appstate_changed';

export interface EmitterInfo {
  userId: string;
  displayName: string;
  // We can add username or other fields later if needed
}

// Represents the data for a remote user's cursor
export interface RemoteCursor {
  userId: string;
  displayName: string;
  x: number;
  y: number;
  // color?: string; // Optional: for styling cursors
  // lastUpdated?: number; // Optional: for fading out stale cursors
}

// Module-scoped variable to store remote cursors
// Key: userId, Value: RemoteCursor
const remoteCursors = new Map<string, RemoteCursor>();

/**
 * Dispatches an event indicating that the remote cursors have been updated.
 * The UI can listen to this event to re-render cursors.
 */
const dispatchRemoteCursorsUpdatedEvent = () => {
  const event = new CustomEvent('remoteCursorsUpdated', {
    detail: new Map(remoteCursors) // Send a copy
  });
  document.dispatchEvent(event);
};

/**
 * Updates or adds a remote cursor and dispatches an update event.
 * @param cursorData The data for the remote cursor.
 */
export const updateRemoteCursor = (cursorData: RemoteCursor): void => {
  remoteCursors.set(cursorData.userId, cursorData);
  dispatchRemoteCursorsUpdatedEvent();
};

/**
 * Removes a remote cursor and dispatches an update event.
 * @param userId The ID of the user whose cursor to remove.
 */
export const removeRemoteCursor = (userId: string): void => {
  if (remoteCursors.has(userId)) {
    remoteCursors.delete(userId);
    dispatchRemoteCursorsUpdatedEvent();
  }
};

/**
 * Gets a snapshot of the current remote cursors.
 * @returns A map of remote cursors.
 */
export const getRemoteCursors = (): Map<string, RemoteCursor> => {
  return new Map(remoteCursors); // Return a copy
};


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
 * @param userId The ID of the user.
 * @param givenName The given name (first name) of the user (can be null or undefined).
 * @param username The username of the user.
 */
export const setRoomEmitterInfo = (
  userId: string,
  givenName: string | null | undefined,
  username: string
): void => {
  const displayName = givenName && givenName.trim() !== "" ? givenName : username;
  currentEmitterInfo = { userId, displayName };
  // console.log("[pad.ws] Emitter info for room events updated:", currentEmitterInfo);
};

// Constants for throttling
export const POINTER_MOVE_THROTTLE_MS = 50; // Throttle pointer move events to avoid spamming

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
      added.push(element.id);
    } else if (prevElement.version !== element.version) {
      edited.push(element.id);
    } else if (prevElement.x !== element.x || prevElement.y !== element.y) {      
      edited.push(element.id);
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
      type: 'pointer_move', // This is a general pointer move for drawing, etc.
      timestamp: Date.now(),
      emitter: currentEmitterInfo ?? undefined,
      pointer: sceneCoords
    };
    dispatchCollabEvent(collabEvent);

    // Dispatch a specific event for cursor position updates for broadcasting
    if (currentEmitterInfo) {
      const cursorUpdateEvent: CollabEvent = {
        type: 'cursor_position_update',
        timestamp: Date.now(),
        emitter: currentEmitterInfo, // Emitter info is mandatory here
        pointer: sceneCoords,
      };
      dispatchCollabEvent(cursorUpdateEvent);
    }
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
 * @param allCurrentElements All current elements in the scene
 * @param addedElementIds IDs of elements that were added
 */
export const dispatchElementsAddedEvent = (
  allCurrentElements: NonDeletedExcalidrawElement[],
  addedElementIds: string[]
): void => {
  // Filter to only include added elements
  const addedElements = allCurrentElements.filter(el => addedElementIds.includes(el.id));
  
  const collabEvent: CollabEvent = {
    type: 'elements_added',
    timestamp: Date.now(),
    emitter: currentEmitterInfo ?? undefined,
    elements: addedElements,
    changedElementIds: addedElementIds
  };
  
  updateLastProcessedSceneVersion(allCurrentElements); // Update version before dispatching
  // console.log("[pad.ws] Dispatching ADDED, lastProcessedSceneVersion set to:", getSceneVersion(allCurrentElements));
  dispatchCollabEvent(collabEvent);
};

/**
 * Creates and dispatches an elements_edited collaboration event
 * @param allCurrentElements All current elements in the scene
 * @param editedElementIds IDs of elements that were edited
 */
export const dispatchElementsEditedEvent = (
  allCurrentElements: NonDeletedExcalidrawElement[],
  editedElementIds: string[]
): void => {
  // Filter to only include edited elements
  const editedElements = allCurrentElements.filter(el => editedElementIds.includes(el.id));
  
  const collabEvent: CollabEvent = {
    type: 'elements_edited',
    timestamp: Date.now(),
    emitter: currentEmitterInfo ?? undefined,
    elements: editedElements,
    changedElementIds: editedElementIds
  };
  
  updateLastProcessedSceneVersion(allCurrentElements); // Update version before dispatching
  // console.log("[pad.ws] Dispatching EDITED, lastProcessedSceneVersion set to:", getSceneVersion(allCurrentElements));
  dispatchCollabEvent(collabEvent);
};

/**
 * Creates and dispatches an elements_deleted collaboration event
 * @param allCurrentElementsAfterDeletion Elements in the scene *after* deletion
 * @param deletedElementIds IDs of elements that were deleted
 * @param deletedElementData The actual deleted element data for the event
 */
export const dispatchElementsDeletedEvent = (
  allCurrentElementsAfterDeletion: NonDeletedExcalidrawElement[],
  deletedElementIds: string[],
  deletedElementData: any[]
): void => {
  const collabEvent: CollabEvent = {
    type: 'elements_deleted',
    timestamp: Date.now(),
    emitter: currentEmitterInfo ?? undefined,
    changedElementIds: deletedElementIds,
    elements: deletedElementData // Send the data of elements that were deleted
  };

  updateLastProcessedSceneVersion(allCurrentElementsAfterDeletion); // Update version based on state after deletion
  // console.log("[pad.ws] Dispatching DELETED, lastProcessedSceneVersion set to:", getSceneVersion(allCurrentElementsAfterDeletion));
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

// Handler for incoming collaboration events
const handleIncomingCollabEvent = (
  event: CustomEvent<CollabEvent>,
  excalidrawAPI: ExcalidrawImperativeAPI
): void => {
  const remoteEventData = event.detail;

  // IMPORTANT: Emitter check to prevent processing self-emitted events in a real collab scenario
  // For DevTools testing, ensure `emitter.userId` in DevTools JSON is different
  // from `currentEmitterInfo.userId` or temporarily comment out this check.
  if (currentEmitterInfo && remoteEventData.emitter?.userId === currentEmitterInfo.userId) {
    // console.log("[CollabReceiver] Ignoring event from self:", remoteEventData.type, remoteEventData.emitter?.userId);
    return;
  }
  // console.log("[CollabReceiver] Received event:", remoteEventData.type, remoteEventData);


  const localElements = excalidrawAPI.getSceneElementsIncludingDeleted();
  const appState = excalidrawAPI.getAppState();
  let elementsToUpdate: ExcalidrawElement[] | undefined = undefined;
  let finalElementsAfterUpdate: readonly ExcalidrawElement[] | undefined = undefined;

  switch (remoteEventData.type) {
    case 'elements_added':
    case 'elements_edited':
      if (remoteEventData.elements && remoteEventData.elements.length > 0) {
        // Ensure elements are in the correct format for restoreElements if necessary
        const restoredRemoteElements = restoreElements(remoteEventData.elements as ExcalidrawElement[], null);
        elementsToUpdate = reconcileElements(
          localElements,
          restoredRemoteElements as ExcalidrawElement[],
          appState
        );
        finalElementsAfterUpdate = elementsToUpdate;
        // console.log("[CollabReceiver] Reconciled elements for add/edit:", elementsToUpdate);
      }
      break;

    case 'elements_deleted':
      if (remoteEventData.elements && remoteEventData.elements.length > 0) {
        const idsToDelete = remoteEventData.elements.map(el => el.id);
        const remoteElementsAfterDeletion = localElements.filter(el => !idsToDelete.includes(el.id));
        
        elementsToUpdate = reconcileElements(
          localElements, 
          restoreElements(remoteElementsAfterDeletion, null) as ExcalidrawElement[], 
          appState
        );
        finalElementsAfterUpdate = elementsToUpdate;
        // console.log(`[CollabReceiver] Reconciled elements after deletion:`, elementsToUpdate);
      }
      break;
    
    case 'cursor_position_update':
      if (remoteEventData.emitter && remoteEventData.pointer) {
        // Ensure it's not an event from self if currentEmitterInfo is set
        if (!currentEmitterInfo || remoteEventData.emitter.userId !== currentEmitterInfo.userId) {
          const cursorData: RemoteCursor = {
            userId: remoteEventData.emitter.userId,
            displayName: remoteEventData.emitter.displayName,
            x: remoteEventData.pointer.x,
            y: remoteEventData.pointer.y,
          };
          updateRemoteCursor(cursorData);
          // console.log("[CollabReceiver] Updated remote cursor:", cursorData);
        }
      }
      break;

    // TODO: Add cases for other event types like 'appstate_changed' later.
    // If handling appState changes, ensure finalElementsAfterUpdate is set if elements are also changed,
    // or handle appState versioning separately.
    default:
      // console.log("[CollabReceiver] Unhandled event type:", remoteEventData.type);
      return;
  }

  if (elementsToUpdate) {
    excalidrawAPI.updateScene({ elements: elementsToUpdate });
    // console.log(`[CollabReceiver] Scene updated via reconcile for event: ${remoteEventData.type}`);
    if (finalElementsAfterUpdate) {
      updateLastProcessedSceneVersion(finalElementsAfterUpdate);
      // console.log(`[CollabReceiver] Scene updated for ${remoteEventData.type}, lastProcessedSceneVersion set to:`, getSceneVersion(finalElementsAfterUpdate));
    }
  }
};

/**
 * Sets up a global event listener for 'collabEvent' to process incoming collaboration data.
 * @param excalidrawAPI The Excalidraw API instance.
 * @returns Cleanup function to remove the event listener.
 */
export const setupCollabEventReceiver = (
  excalidrawAPI: ExcalidrawImperativeAPI
): (() => void) => {
  if (!excalidrawAPI) return () => {};

  const eventListener = (event: Event) => {
    // Type guard to ensure it's a CustomEvent<CollabEvent>
    if (event instanceof CustomEvent && event.detail && typeof event.detail.type === 'string') {
      handleIncomingCollabEvent(event as CustomEvent<CollabEvent>, excalidrawAPI);
    }
  };

  document.addEventListener('collabEvent', eventListener);
  // console.log("[CollabReceiver] Event listener for 'collabEvent' added.");

  return () => {
    document.removeEventListener('collabEvent', eventListener);
    // console.log("[CollabReceiver] Event listener for 'collabEvent' removed.");
  };
};
