import React, { useEffect, useReducer, useRef, useCallback } from 'react';
import throttle from 'lodash.throttle';
import isEqual from 'lodash.isequal';
import {
  viewportCoordsToSceneCoords,
  restoreElements,
  reconcileElements,
  getSceneVersion,
} from '@atyrode/excalidraw';
import type {
  ExcalidrawImperativeAPI,
  AppState,
  SocketId,
  Collaborator as ExcalidrawCollaboratorType,
} from '@atyrode/excalidraw/types';
import type {
  NonDeletedExcalidrawElement,
  ExcalidrawElement,
} from '@atyrode/excalidraw/element/types';
import type { UserInfo } from './useAuthStatus';
import type { WebSocketMessage } from './usePadWebSocket';

// --- 1. Consolidated & Unified Types ---
interface PointerData {
  x: number;
  y: number;
  tool: 'laser' | 'pointer';
  button?: 'up' | 'down'; // Added button state here
}

interface EmitterInfo {
  userId: string;
  displayName: string;
}

interface Collaborator {
  id: SocketId;
  pointer?: PointerData;
  button?: 'up' | 'down';
  selectedElementIds?: AppState['selectedElementIds'];
  username?: string;
  userState?: 'active' | 'away' | 'idle';
  color?: { background: string; stroke: string };
  avatarUrl?: string;
}

// --- 2. State Definition for useReducer ---
interface CollabState {
  emitterInfo: EmitterInfo | null;
  collaborators: Map<SocketId, Collaborator>;
  lastProcessedSceneVersion: number;
}

const initialState: CollabState = {
  emitterInfo: null,
  collaborators: new Map(),
  lastProcessedSceneVersion: -1,
};

// --- 3. Action Definitions for useReducer ---
type CollabAction =
  | { type: 'SET_EMITTER_INFO'; payload: EmitterInfo | null }
  | { type: 'UPDATE_LAST_PROCESSED_SCENE_VERSION'; payload: readonly ExcalidrawElement[] }
  | { type: 'REMOTE_USER_JOINED'; payload: { userId: SocketId; displayName?: string } }
  | { type: 'REMOTE_USER_LEFT'; payload: { userId: SocketId } }
  | { type: 'REMOTE_POINTER_UPDATE'; payload: { userId: SocketId; pointerData: PointerData } }
  | { type: 'CLEAR_COLLABORATORS' }; // Action to clear collaborators

// --- Utility Functions ---
const POINTER_MOVE_THROTTLE_MS = 50;
const getRandomCollaboratorColor = () => {
  const colors = [
    { background: "#5C2323", stroke: "#FF6B6B" }, // Dark Red
    { background: "#1E4620", stroke: "#6BCB77" }, // Dark Green
    { background: "#1A3A5F", stroke: "#4F9CF9" }, // Dark Blue
    { background: "#5F4D1C", stroke: "#FFC83D" }, // Dark Yellow
    { background: "#3A1E5C", stroke: "#C56CF0" }, // Dark Purple
    { background: "#5F3A1C", stroke: "#FF9F43" }, // Dark Orange
    { background: "#1E4647", stroke: "#5ECED4" }, // Dark Cyan
    { background: "#4E1A3A", stroke: "#F368BC" }, // Dark Pink
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

const convertToSceneCoords = (
  clientX: number, clientY: number, appState: AppState | null
) => {
  if (!appState) return { x: 0, y: 0 }; // Should ideally not happen if API is available
  return viewportCoordsToSceneCoords({ clientX, clientY }, appState);
};

// --- 4. Reducer Function ---
const collabReducer = (state: CollabState, action: CollabAction): CollabState => {
  switch (action.type) {
    case 'SET_EMITTER_INFO':
      return { ...state, emitterInfo: action.payload };
    case 'UPDATE_LAST_PROCESSED_SCENE_VERSION':
      return { ...state, lastProcessedSceneVersion: getSceneVersion(action.payload) };
    case 'CLEAR_COLLABORATORS':
      return { ...state, collaborators: new Map() };
    case 'REMOTE_USER_JOINED': {
      const { userId, displayName } = action.payload;
      if (state.collaborators.has(userId) || (state.emitterInfo && userId === state.emitterInfo.userId)) {
        return state;
      }
      const newCollaborator: Collaborator = {
        id: userId,
        username: displayName || userId.toString(),
        pointer: { x: 0, y: 0, tool: 'pointer' }, // Default pointer
        color: getRandomCollaboratorColor(),
        userState: 'active',
      };
      const newCollaborators = new Map(state.collaborators);
      newCollaborators.set(userId, newCollaborator);
      return { ...state, collaborators: newCollaborators };
    }
    case 'REMOTE_USER_LEFT': {
      const { userId } = action.payload;
      if (!state.collaborators.has(userId) || (state.emitterInfo && userId === state.emitterInfo.userId)) {
        return state;
      }
      const newCollaborators = new Map(state.collaborators);
      newCollaborators.delete(userId);
      return { ...state, collaborators: newCollaborators };
    }
    case 'REMOTE_POINTER_UPDATE': {
      const { userId, pointerData } = action.payload;
      if (state.emitterInfo && userId === state.emitterInfo.userId) return state; // Ignore self

      const newCollaborators = new Map(state.collaborators);
      const existing = newCollaborators.get(userId);
      if (existing) {
        newCollaborators.set(userId, { ...existing, pointer: pointerData, button: pointerData.button });
      } else {
        newCollaborators.set(userId, {
          id: userId,
          username: userId.toString(), // Fallback username
          pointer: pointerData,
          button: pointerData.button,
          color: getRandomCollaboratorColor(),
          userState: 'active',
        });
      }
      return { ...state, collaborators: newCollaborators };
    }
    default:
      return state;
  }
};

// --- 5. The Custom Hook ---
interface UseCollabManagerProps {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  lastJsonMessage: WebSocketMessage | null;
  user: UserInfo | null;
  sendMessage: (type: string, data?: any) => void;
  isOnline: boolean; // To know if we should attempt sending messages or clearing state
}

export const useCollabManager = ({
  excalidrawAPI,
  lastJsonMessage,
  user,
  sendMessage,
  isOnline,
}: UseCollabManagerProps) => {
  const [state, dispatch] = useReducer(collabReducer, initialState);
  const previousElementsRef = useRef<{ [id: string]: Readonly<NonDeletedExcalidrawElement> }>({});
  const previousAppStateRef = useRef<AppState | null>(null);

  // Effect 0: Clear collaborators when offline
  useEffect(() => {
    if (!isOnline) {
      dispatch({ type: 'CLEAR_COLLABORATORS' });
    }
  }, [isOnline]);

  // Effect 1: Set Emitter Info & Initialize Refs
  useEffect(() => {
    if (user?.id && excalidrawAPI) {
      const displayName = user.username || user.id.toString();
      dispatch({ type: 'SET_EMITTER_INFO', payload: { userId: user.id, displayName } });

      // Initialize previousAppStateRef as soon as excalidrawAPI is available
      if (!previousAppStateRef.current) {
        const currentAppState = excalidrawAPI.getAppState();
        previousAppStateRef.current = JSON.parse(JSON.stringify(currentAppState));
      }

      const initialElements = excalidrawAPI.getSceneElements();
      const initialElementsMap: { [id: string]: Readonly<NonDeletedExcalidrawElement> } = {};
      initialElements.forEach(el => {
        if (!el.isDeleted) { // Only store non-deleted elements as baseline
          initialElementsMap[el.id] = JSON.parse(JSON.stringify(el));
        }
      });
      previousElementsRef.current = initialElementsMap;
      dispatch({ type: 'UPDATE_LAST_PROCESSED_SCENE_VERSION', payload: initialElements });

    } else if (!user?.id) {
        // Clear emitter info if user logs out
        dispatch({ type: 'SET_EMITTER_INFO', payload: null });
    }
  }, [user?.id, user?.username, excalidrawAPI]);


  // Effect 2: Setup Excalidraw Event Handlers for broadcasting local changes
  useEffect(() => {
    if (!excalidrawAPI || !state.emitterInfo || !isOnline) return;

    const handlePointerEvent = (
      type: 'pointer_down' | 'pointer_up',
      event: PointerEvent // This event comes from Excalidraw's onPointerDown/Up
    ) => {
      const appState = excalidrawAPI.getAppState();
      const sceneCoords = convertToSceneCoords(event.clientX, event.clientY, appState);
      const currentTool = appState.activeTool.type;
      const displayTool: 'laser' | 'pointer' = currentTool === 'laser' ? 'laser' : 'pointer';
      sendMessage('pointer_event', { // Generic event type
        pointer: { ...sceneCoords, tool: displayTool },
        button: type === 'pointer_down' ? 'down' : 'up',
        emitter: state.emitterInfo, // Send emitter info for server to route
      });
    };
    
    const unsubPointerDown = excalidrawAPI.onPointerDown(
        (_activeTool, _pointerDownState, event) => handlePointerEvent('pointer_down', event)
    );
    const unsubPointerUp = excalidrawAPI.onPointerUp(
        (_activeTool, _pointerDownState, event) => handlePointerEvent('pointer_up', event)
    );

    const throttledPointerMove = throttle((event: PointerEvent) => { // This event is a native browser PointerEvent
      const appState = excalidrawAPI.getAppState();
      const sceneCoords = convertToSceneCoords(event.clientX, event.clientY, appState);
      const currentTool = appState.activeTool.type;
      const displayTool: 'laser' | 'pointer' = currentTool === 'laser' ? 'laser' : 'pointer';
      sendMessage('pointer_update', { // This is for cursor position only
        pointer: { ...sceneCoords, tool: displayTool },
        emitter: state.emitterInfo,
      });
    }, POINTER_MOVE_THROTTLE_MS);

    const canvas = document.querySelector(".excalidraw");
    if (canvas) canvas.addEventListener("pointermove", throttledPointerMove);


    const onChange = (
      elements: readonly NonDeletedExcalidrawElement[],
      appState: AppState,
    ) => {
      if (!state.emitterInfo || !isOnline || !previousAppStateRef.current) return; // Ensure previousAppStateRef is initialized

      // 1. Element Changes
      const currentElementsMap: { [id: string]: Readonly<NonDeletedExcalidrawElement> } = {};
      const addedElementIds: string[] = [];
      const editedElementIds: string[] = [];
      const deletedElementIds: string[] = [];

      elements.forEach(element => { // elements are current non-deleted elements
        currentElementsMap[element.id] = element;
        const prevElement = previousElementsRef.current[element.id];
        if (!prevElement) {
          addedElementIds.push(element.id);
        } else if (prevElement.version !== element.version || !isEqual(prevElement, element)) {
          editedElementIds.push(element.id);
        }
      });

      Object.keys(previousElementsRef.current).forEach(id => {
        if (!currentElementsMap[id]) {
          deletedElementIds.push(id);
        }
      });
      
      const allCurrentElementsForVersion = excalidrawAPI.getSceneElementsIncludingDeleted();

      if (addedElementIds.length > 0) {
        const addedElementsData = elements.filter(el => addedElementIds.includes(el.id));
        sendMessage('elements_added', { elements: addedElementsData, emitter: state.emitterInfo });
        dispatch({type: 'UPDATE_LAST_PROCESSED_SCENE_VERSION', payload: allCurrentElementsForVersion});
      }
      if (editedElementIds.length > 0) {
        const editedElementsData = elements.filter(el => editedElementIds.includes(el.id));
        sendMessage('elements_edited', { elements: editedElementsData, emitter: state.emitterInfo });
        dispatch({type: 'UPDATE_LAST_PROCESSED_SCENE_VERSION', payload: allCurrentElementsForVersion});
      }
      if (deletedElementIds.length > 0) {
        // For deleted elements, we need to send their state *before* deletion.
        const deletedElementsData = deletedElementIds.map(id => ({ ...previousElementsRef.current[id], isDeleted: true }));
        sendMessage('elements_deleted', { changedElementIds: deletedElementIds, elements: deletedElementsData, emitter: state.emitterInfo });
        const elementsAfterActualDeletion = allCurrentElementsForVersion.filter(el => !deletedElementIds.includes(el.id));
        dispatch({type: 'UPDATE_LAST_PROCESSED_SCENE_VERSION', payload: elementsAfterActualDeletion});
      }
      
      const newPreviousElements: { [id: string]: Readonly<NonDeletedExcalidrawElement> } = {};
      elements.forEach(el => newPreviousElements[el.id] = JSON.parse(JSON.stringify(el)));
      previousElementsRef.current = newPreviousElements;

      // 2. AppState Changes
      if (previousAppStateRef.current) {
        const changedAppState: Partial<AppState> = {};
        const ignoredKeys = ['collaborators', 'fileHandle', 'files', 'elements', 'visibleElements', 'sceneNonce'];
        for (const key in appState) {
          if (ignoredKeys.includes(key)) continue;
          const currentVal = (appState as any)[key];
          const previousVal = (previousAppStateRef.current as any)[key];
          if (!isEqual(currentVal, previousVal)) {
            (changedAppState as any)[key] = currentVal;
          }
        }
        // if (Object.keys(changedAppState).length > 0) {
        //   sendMessage('appstate_changed', { appState: changedAppState, emitter: state.emitterInfo });
        // }
      }
      previousAppStateRef.current = JSON.parse(JSON.stringify(appState));
    };

    const unsubChange = excalidrawAPI.onChange(onChange);

    return () => {
      if (canvas) canvas.removeEventListener("pointermove", throttledPointerMove);
      throttledPointerMove.cancel();
      unsubChange();
      unsubPointerDown();
      unsubPointerUp();
    };
  }, [excalidrawAPI, state.emitterInfo, sendMessage, isOnline]);

  // Effect 3: Handle Incoming WebSocket Messages
  useEffect(() => {
    if (!lastJsonMessage || !excalidrawAPI || !user || !isOnline) return;

    const { type, connection_id, data: messageData } = lastJsonMessage as any;

    if (state.emitterInfo && connection_id === state.emitterInfo.userId) {
      return; // Ignore messages from self if server echoes them
    }

    switch (type) {
      case 'user_joined':
        dispatch({ type: 'REMOTE_USER_JOINED', payload: { userId: connection_id as SocketId, displayName: messageData?.displayName || connection_id } });
        break;
      case 'user_left':
        dispatch({ type: 'REMOTE_USER_LEFT', payload: { userId: connection_id as SocketId } });
        break;
      case 'pointer_update': // From other users' throttled pointer moves
        if (messageData?.pointer) {
          dispatch({ type: 'REMOTE_POINTER_UPDATE', payload: { userId: connection_id as SocketId, pointerData: messageData.pointer } });
        }
        break;
      case 'pointer_event': // From other users' pointer down/up
        if (messageData?.pointer && messageData?.button) {
             dispatch({ type: 'REMOTE_POINTER_UPDATE', payload: { userId: connection_id as SocketId, pointerData: {...messageData.pointer, button: messageData.button} } });
        }
        break;
      case 'elements_added':
      case 'elements_edited': {
        const remoteElements = messageData?.elements as ExcalidrawElement[];
        if (remoteElements && remoteElements.length > 0) {
          const localElements = excalidrawAPI.getSceneElementsIncludingDeleted();
          const currentAppState = excalidrawAPI.getAppState();
          const restored = restoreElements(remoteElements, null);
          const reconciled = reconcileElements(localElements, restored, currentAppState);
          excalidrawAPI.updateScene({ elements: reconciled });
          dispatch({type: 'UPDATE_LAST_PROCESSED_SCENE_VERSION', payload: reconciled});
        }
        break;
      }
      case 'elements_deleted': {
        // const idsToDelete = messageData?.changedElementIds as string[];
        const deletedElementData = messageData?.elements as ExcalidrawElement[]; // These are already marked isDeleted:true by sender
        if (deletedElementData && deletedElementData.length > 0) {
          const localElements = excalidrawAPI.getSceneElementsIncludingDeleted();
          const currentAppState = excalidrawAPI.getAppState();
          const reconciled = reconcileElements(localElements, deletedElementData, currentAppState);
          excalidrawAPI.updateScene({ elements: reconciled });
          dispatch({type: 'UPDATE_LAST_PROCESSED_SCENE_VERSION', payload: reconciled});
        }
        break;
      }
      // case 'appstate_changed': {
      //   const remoteAppStateChanges = messageData?.appState as Partial<AppState>;
      //   if (remoteAppStateChanges) {
      //     const { collaborators, ...otherChanges } = remoteAppStateChanges;
      //     if (Object.keys(otherChanges).length > 0) {
      //       // Merge with current AppState to ensure all required fields are present
      //       const currentAppState = excalidrawAPI.getAppState();
      //       const newAppState = {
      //         ...currentAppState,
      //         ...otherChanges,
      //         // Ensure selectedElementIds is always an object, even if otherChanges makes it undefined
      //         selectedElementIds: otherChanges.selectedElementIds || currentAppState.selectedElementIds || {},
      //       };
      //       excalidrawAPI.updateScene({ appState: newAppState });
      //     }
      //   }
      //   break;
      // }
    }
  }, [lastJsonMessage, excalidrawAPI, user, state.emitterInfo, isOnline]);

  // Effect 4: Update Excalidraw Scene with Collaborator Changes from local state
  useEffect(() => {
    if (!excalidrawAPI) return;

    const excalidrawCollaborators = new Map<SocketId, ExcalidrawCollaboratorType>();
    if (isOnline && state.collaborators) { // Only show collaborators if online
        state.collaborators.forEach((collab, id) => {
        // Ensure that the current user's own pointer is not added to the collaborators map
        // as Excalidraw handles the local user's pointer directly.
        if (state.emitterInfo && id === state.emitterInfo.userId) {
            return;
        }
        excalidrawCollaborators.set(id, {
            id: collab.id,
            pointer: collab.pointer,
            username: collab.username,
            button: collab.button,
            selectedElementIds: collab.selectedElementIds,
            userState: collab.userState,
            color: collab.color,
            avatarUrl: collab.avatarUrl,
        });
        });
    }
    // This will clear collaborators from the scene if excalidrawCollaborators is empty (e.g. offline)
    excalidrawAPI.updateScene({ collaborators: excalidrawCollaborators });

  }, [excalidrawAPI, state.collaborators, state.emitterInfo, isOnline]);
};
