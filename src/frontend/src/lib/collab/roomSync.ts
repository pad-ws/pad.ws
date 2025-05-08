import throttle from "lodash.throttle";
import isEqual from "lodash.isequal";
import type * as TExcalidraw from "@atyrode/excalidraw";
import {
  viewportCoordsToSceneCoords,
  restoreElements,
  reconcileElements,
  getSceneVersion,
} from "@atyrode/excalidraw";
import type {
  NonDeletedExcalidrawElement,
  ExcalidrawElement,
} from "@atyrode/excalidraw/element/types";
import type { ExcalidrawImperativeAPI, AppState } from "@atyrode/excalidraw/types";
import type { CollabEvent, CollabEventType, EmitterInfo, RemoteCursor } from "./types";
import { updateRemoteCursor } from "./cursor";

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
  
  elements.forEach(element => {
    if ((element as any).isDeleted) {
      const prevElement = previousElementsRef.current[element.id];
      if (prevElement && !(prevElement as any).isDeleted) {
        deleted.push(element.id);
        deletedElements.push({
          ...prevElement,
          id: element.id
        });
      }
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
  
  Object.keys(previousElementsRef.current).forEach(id => {
    if (!currentElementsMap[id] && !deleted.includes(id)) {
      deleted.push(id);
      deletedElements.push({
        ...previousElementsRef.current[id],
        id
      });
    }
  });
  
  const deepCopiedElementsMap: { [id: string]: NonDeletedExcalidrawElement } = {};
  
  Object.keys(currentElementsMap).forEach(id => {
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
  
  const convertToSceneCoords = (
    clientX: number,
    clientY: number,
    appState: AppState
  ) => {
    return viewportCoordsToSceneCoords(
      { clientX, clientY },
      appState
    );
  };
  
  const handlePointerDown = (
    activeTool: AppState["activeTool"],
    pointerDownState: any,
    event: PointerEvent
  ) => {
    if (!excalidrawAPI) return;
    
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
  
  const handlePointerUp = (
    activeTool: AppState["activeTool"],
    pointerDownState: any,
    event: PointerEvent
  ) => {
    if (!excalidrawAPI) return;
    
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
  
  const handlePointerMove = throttle((event: PointerEvent) => {
    if (!excalidrawAPI) return;
    
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

    if (currentEmitterInfo) {
      const cursorUpdateEvent: CollabEvent = {
        type: 'cursor_position_update',
        timestamp: Date.now(),
        emitter: currentEmitterInfo,
        pointer: sceneCoords,
      };
      dispatchCollabEvent(cursorUpdateEvent);
    }
  }, POINTER_MOVE_THROTTLE_MS);
  
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
  
  const unsubPointerDown = excalidrawAPI.onPointerDown(handlePointerDown);
  const unsubPointerUp = excalidrawAPI.onPointerUp(handlePointerUp);
  
  return () => {
    unsubPointerDown();
    unsubPointerUp();
    if (canvas) {
      canvas.removeEventListener("pointermove", handlePointerMove);
    }
    handlePointerMove.cancel();
  };
};

export const dispatchElementsAddedEvent = (
  allCurrentElements: NonDeletedExcalidrawElement[],
  addedElementIds: string[]
): void => {
  const addedElements = allCurrentElements.filter(el => addedElementIds.includes(el.id));
  
  const collabEvent: CollabEvent = {
    type: 'elements_added',
    timestamp: Date.now(),
    emitter: currentEmitterInfo ?? undefined,
    elements: addedElements,
    changedElementIds: addedElementIds
  };
  
  updateLastProcessedSceneVersion(allCurrentElements);
  dispatchCollabEvent(collabEvent);
};

export const dispatchElementsEditedEvent = (
  allCurrentElements: NonDeletedExcalidrawElement[],
  editedElementIds: string[]
): void => {
  const editedElements = allCurrentElements.filter(el => editedElementIds.includes(el.id));
  
  const collabEvent: CollabEvent = {
    type: 'elements_edited',
    timestamp: Date.now(),
    emitter: currentEmitterInfo ?? undefined,
    elements: editedElements,
    changedElementIds: editedElementIds
  };
  
  updateLastProcessedSceneVersion(allCurrentElements);
  dispatchCollabEvent(collabEvent);
};

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
    elements: deletedElementData
  };

  updateLastProcessedSceneVersion(allCurrentElementsAfterDeletion);
  dispatchCollabEvent(collabEvent);
};

export const dispatchAppStateChangedEvent = (
  currentState: AppState,
  previousState: AppState | null
): void => {
  if (!previousState) {
    return;
  }

  const changedAppState: Partial<AppState> = {};

  for (const key in currentState) {
      if (key === 'collaborators') {
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(currentState, key)) {
        const currentVal = (currentState as any)[key];
        const previousVal = (previousState as any)[key];

        if (!Object.prototype.hasOwnProperty.call(previousState, key) || !isEqual(currentVal, previousVal)) {
          (changedAppState as any)[key] = currentVal;
        }
      }
    }

  if (Object.keys(changedAppState).length > 0) {
    const collabEvent: CollabEvent = {
      type: 'appstate_changed',
      timestamp: Date.now(),
      emitter: currentEmitterInfo ?? undefined,
      appState: changedAppState,
    };
    dispatchCollabEvent(collabEvent);
  }
};

const handleIncomingCollabEvent = (
  event: CustomEvent<CollabEvent>,
  excalidrawAPI: ExcalidrawImperativeAPI
): void => {
  const remoteEventData = event.detail;

  if (currentEmitterInfo && remoteEventData.emitter?.userId === currentEmitterInfo.userId) {
    return;
  }

  const localElements = excalidrawAPI.getSceneElementsIncludingDeleted();
  const appState = excalidrawAPI.getAppState();
  let elementsToUpdate: ExcalidrawElement[] | undefined = undefined;
  let finalElementsAfterUpdate: readonly ExcalidrawElement[] | undefined = undefined;

  switch (remoteEventData.type) {
    case 'elements_added':
    case 'elements_edited':
      if (remoteEventData.elements && remoteEventData.elements.length > 0) {
        const restoredRemoteElements = restoreElements(remoteEventData.elements as ExcalidrawElement[], null);
        elementsToUpdate = reconcileElements(
          localElements,
          restoredRemoteElements as ExcalidrawElement[],
          appState
        );
        finalElementsAfterUpdate = elementsToUpdate;
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
      }
      break;
    
    case 'cursor_position_update':
      if (remoteEventData.emitter && remoteEventData.pointer) {
        if (!currentEmitterInfo || remoteEventData.emitter.userId !== currentEmitterInfo.userId) {
          const cursorData: RemoteCursor = {
            userId: remoteEventData.emitter.userId,
            displayName: remoteEventData.emitter.displayName,
            x: remoteEventData.pointer.x,
            y: remoteEventData.pointer.y,
          };
          updateRemoteCursor(cursorData);
        }
      }
      break;

    default:
      return;
  }

  if (elementsToUpdate) {
    excalidrawAPI.updateScene({ elements: elementsToUpdate });
    if (finalElementsAfterUpdate) {
      updateLastProcessedSceneVersion(finalElementsAfterUpdate);
    }
  }
};

export const setupCollabEventReceiver = (
  excalidrawAPI: ExcalidrawImperativeAPI
): (() => void) => {
  if (!excalidrawAPI) return () => {};

  const eventListener = (event: Event) => {
    if (event instanceof CustomEvent && event.detail && typeof event.detail.type === 'string') {
      handleIncomingCollabEvent(event as CustomEvent<CollabEvent>, excalidrawAPI);
    }
  };

  document.addEventListener('collabEvent', eventListener);

  return () => {
    document.removeEventListener('collabEvent', eventListener);
  };
};
