import React, { PureComponent } from 'react';
import type { ExcalidrawImperativeAPI, AppState, SocketId, Collaborator as ExcalidrawCollaboratorType } from '@atyrode/excalidraw/types';
import type { ExcalidrawElement as ExcalidrawElementType } from '@atyrode/excalidraw/element/types';
import {
  viewportCoordsToSceneCoords,
  getSceneVersion,
  reconcileElements,
  restoreElements
} from '@atyrode/excalidraw';
import throttle from 'lodash.throttle';
import isEqual from 'lodash.isequal';

import Portal from './Portal';
import type { WebSocketMessage, ConnectionStatus } from './Portal';
import type { UserInfo } from '../../hooks/useAuthStatus';
import { debounce, type DebouncedFunction } from '../debounce';
import { POINTER_MOVE_THROTTLE_MS, ENABLE_PERIODIC_FULL_SYNC, PERIODIC_FULL_SYNC_INTERVAL_MS } from '../../constants';

interface PointerData {
  x: number;
  y: number;
  tool: 'laser' | 'pointer';
  button?: 'up' | 'down';
}

export interface Collaborator {
  id: SocketId;
  pointer?: PointerData;
  button?: 'up' | 'down';
  selectedElementIds?: AppState['selectedElementIds'];
  username?: string;
  userState?: 'active' | 'away' | 'idle';
  color?: { background: string; stroke: string };
  avatarUrl?: string;
}

const getRandomCollaboratorColor = () => {
  const colors = [
    { background: "#5C2323", stroke: "#FF6B6B" }, { background: "#1E4620", stroke: "#6BCB77" },
    { background: "#1A3A5F", stroke: "#4F9CF9" }, { background: "#5F4D1C", stroke: "#FFC83D" },
    { background: "#3A1E5C", stroke: "#C56CF0" }, { background: "#5F3A1C", stroke: "#FF9F43" },
    { background: "#1E4647", stroke: "#5ECED4" }, { background: "#4E1A3A", stroke: "#F368BC" },
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

interface CollabProps {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  user: UserInfo | null;
  isOnline: boolean;
  isLoadingAuth: boolean;
  padId: string | null;
}

interface CollabState {
  errorMessage: string | null;
  connectionStatus: ConnectionStatus;
  username: string;
  collaborators: Map<SocketId, Collaborator>;
  lastProcessedSceneVersion: number;
}

class Collab extends PureComponent<CollabProps, CollabState> {
  [x: string]: any;
  readonly state: CollabState;
  private portal: Portal;
  private debouncedBroadcastAppState: DebouncedFunction<[AppState]>;
  private lastSentAppState: AppState | null = null;

  private throttledOnPointerMove: any;
  private unsubExcalidrawPointerDown: (() => void) | null = null;
  private unsubExcalidrawPointerUp: (() => void) | null = null;
  private unsubExcalidrawSceneChange: (() => void) | null = null;
  private lastBroadcastedSceneVersion: number = -1;
  private isInitialLoad: boolean = true;

  props: any;

  constructor(props: CollabProps) {
    super(props);
    this.state = {
      errorMessage: null,
      connectionStatus: 'Uninstantiated',
      username: props.user?.username || props.user?.id || '',
      collaborators: new Map(),
      lastProcessedSceneVersion: -1,
    };

    this.portal = new Portal(
      this,
      props.padId,
      props.user,
      props.isOnline, // Passing isOnline as isAuthenticated
      props.isLoadingAuth,
      this.handlePortalStatusChange,
      this.handlePortalMessage
    );

    this.throttledOnPointerMove = throttle((event: PointerEvent) => {
      this.handlePointerMove(event);
    }, POINTER_MOVE_THROTTLE_MS);

    this.debouncedBroadcastAppState = debounce((appState: AppState) => {
      if (this.portal.isOpen() && this.props.isOnline) {
        if (!this.lastSentAppState || !isEqual(this.lastSentAppState, appState)) {
          if (this.lastSentAppState) {
            const changes = this.detectAppStateChanges(this.lastSentAppState, appState);
            if (Object.keys(changes).length > 0) {
              console.debug('[pad.ws] AppState changes detected:', changes);
              this.portal.broadcastAppStateUpdate(appState);
              this.lastSentAppState = { ...appState };
            }
          } else {
            this.portal.broadcastAppStateUpdate(appState);
            this.lastSentAppState = { ...appState };
          }
        }
      }
    }, 500);
  }

  /* AppState Change Detection */

  private detectAppStateChanges = (oldState: AppState, newState: AppState): Record<string, { old: any, new: any }> => {
    const changes: Record<string, { old: any, new: any }> = {};

    // Get all unique keys from both old and new state
    const allKeys = new Set([
      ...Object.keys(oldState),
      ...Object.keys(newState)
    ]);

    // Compare each field dynamically, but exclude collaborators field
    allKeys.forEach(field => {
      if (field === 'collaborators') return;

      const oldValue = oldState[field as keyof AppState];
      const newValue = newState[field as keyof AppState];

      if (this.hasChanged(oldValue, newValue)) {
        changes[field] = {
          old: this.serializeValue(oldValue),
          new: this.serializeValue(newValue)
        };
      }
    });

    return changes;
  };

  private hasChanged = (oldValue: any, newValue: any): boolean => {
    // Handle Maps (like selectedElementIds)
    if (oldValue instanceof Map && newValue instanceof Map) {
      if (oldValue.size !== newValue.size) return true;
      const oldEntries = Array.from(oldValue.entries());
      for (const [key, value] of oldEntries) {
        if (!newValue.has(key) || newValue.get(key) !== value) return true;
      }
      return false;
    }

    // Handle objects with zoom value
    if (typeof oldValue === 'object' && typeof newValue === 'object' && oldValue !== null && newValue !== null) {
      // Special handling for zoom object
      if ('value' in oldValue && 'value' in newValue) {
        return oldValue.value !== newValue.value;
      }
      return JSON.stringify(oldValue) !== JSON.stringify(newValue);
    }

    // Handle primitives
    return oldValue !== newValue;
  };

  private serializeValue = (value: any): any => {
    if (value instanceof Map) {
      return Object.fromEntries(value);
    }
    if (typeof value === 'object' && value !== null) {
      return { ...value };
    }
    return value;
  };

  /* Component Lifecycle */

  componentDidMount() {
    if (this.portal) {
      this.portal.initiate();
    }

    if (this.props.user) {
      this.updateUsername(this.props.user);
    }
    this.updateExcalidrawCollaborators(); // Initial update for collaborators
    this.addPointerEventListeners();
    this.addSceneChangeListeners();

    // Initialize lastBroadcastedSceneVersion
    if (this.props.excalidrawAPI) {
      const initialElements = this.props.excalidrawAPI.getSceneElementsIncludingDeleted();
      // Set initial broadcast version.
      this.lastBroadcastedSceneVersion = getSceneVersion(initialElements);
      // Also set the initial processed version from local state
      this.setState({ lastProcessedSceneVersion: this.lastBroadcastedSceneVersion });
    }
    if (this.props.isOnline && this.props.padId) {
      // Potentially call a method to broadcast initial scene if this client is the first or needs to sync
      // this.broadcastFullSceneUpdate(true); // Example: true for SCENE_INIT
    }

    // Start periodic full sync if enabled
    if (ENABLE_PERIODIC_FULL_SYNC) {
      this.startPeriodicFullSync();
    }

    this.isInitialLoad = false;
  }

  componentDidUpdate(prevProps: CollabProps, prevState: CollabState) {
    if (
      this.props.user !== prevProps.user ||
      this.props.isOnline !== prevProps.isOnline ||
      this.props.isLoadingAuth !== prevProps.isLoadingAuth
    ) {
      this.updateUsername(this.props.user); // Update username if user object changed
      this.portal.updateAuthInfo(this.props.user, this.props.isOnline, this.props.isLoadingAuth);
    }

    if (this.props.padId !== prevProps.padId) {
      // Portal's updatePadId will handle disconnection from old and connection to new
      this.debouncedBroadcastAppState.cancel(); // Cancel any pending app state updates for the old pad
      this.lastSentAppState = null; // Reset last sent app state for the new pad

      // Reset versions immediately when switching pads
      this.lastBroadcastedSceneVersion = -1;
      // Mark as initial load for the new pad
      this.isInitialLoad = true;

      this.portal.updatePadId(this.props.padId);
      this.setState({
        collaborators: new Map(),
        lastProcessedSceneVersion: -1,
        username: this.props.user?.username || this.props.user?.id || '',
        // connectionStatus will be updated by portal's callbacks
      });
    }

    if (this.state.collaborators !== prevState.collaborators) {
      if (this.updateExcalidrawCollaborators) this.updateExcalidrawCollaborators();
    }
  }

  componentWillUnmount() {
    this.portal.closePortal(); // Changed from close()
    this.removePointerEventListeners();
    if (this.throttledOnPointerMove && typeof this.throttledOnPointerMove.cancel === 'function') {
      this.throttledOnPointerMove.cancel();
    }
    this.debouncedBroadcastAppState.cancel();
    this.removeSceneChangeListeners();
    this.stopPeriodicFullSync(); // Stop periodic sync on unmount
  }

  /* Periodic Full Sync */

  private periodicFullSyncIntervalId: ReturnType<typeof setInterval> | null = null;

  private startPeriodicFullSync = () => {
    if (this.periodicFullSyncIntervalId !== null) {
      // Already running
      return;
    }
    this.periodicFullSyncIntervalId = setInterval(() => {
      if (this.props.excalidrawAPI && this.portal.isOpen() && this.props.isOnline) {
        console.debug('[pad.ws] Performing periodic full scene sync.');
        const allCurrentElements = this.props.excalidrawAPI.getSceneElementsIncludingDeleted();
        this.portal.broadcastSceneUpdate('SCENE_UPDATE', allCurrentElements, true);
        this.lastBroadcastedSceneVersion = getSceneVersion(allCurrentElements);
      }
    }, PERIODIC_FULL_SYNC_INTERVAL_MS);
  };

  private stopPeriodicFullSync = () => {
    if (this.periodicFullSyncIntervalId !== null) {
      clearInterval(this.periodicFullSyncIntervalId);
      this.periodicFullSyncIntervalId = null;
      console.debug('[pad.ws] Stopped periodic full scene sync.');
    }
  };


  /* Pointer */

  private addPointerEventListeners = () => {
    if (!this.props.excalidrawAPI) return;
    document.addEventListener('pointermove', this.throttledOnPointerMove);
    this.unsubExcalidrawPointerDown = this.props.excalidrawAPI.onPointerDown(
      (_activeTool, _pointerDownState, event) => this.handlePointerInteraction('down', event)
    );
    this.unsubExcalidrawPointerUp = this.props.excalidrawAPI.onPointerUp(
      (_activeTool, _pointerUpState, event) => this.handlePointerInteraction('up', event)
    );
  };

  private removePointerEventListeners = () => {
    document.removeEventListener('pointermove', this.throttledOnPointerMove);
    if (this.unsubExcalidrawPointerDown) this.unsubExcalidrawPointerDown();
    if (this.unsubExcalidrawPointerUp) this.unsubExcalidrawPointerUp();
    this.unsubExcalidrawPointerDown = null;
    this.unsubExcalidrawPointerUp = null;
  };

  private handlePointerInteraction = (button: 'down' | 'up', event: MouseEvent | PointerEvent) => {
    if (!this.props.excalidrawAPI || !this.portal.isOpen() || !this.props.isOnline) return;
    const appState = this.props.excalidrawAPI.getAppState();
    const sceneCoords = viewportCoordsToSceneCoords({ clientX: event.clientX, clientY: event.clientY }, appState);
    const currentTool = appState.activeTool.type;
    const displayTool: 'laser' | 'pointer' = currentTool === 'laser' ? 'laser' : 'pointer';
    const pointerData: PointerData = { x: sceneCoords.x, y: sceneCoords.y, tool: displayTool, button: button };
    this.portal.broadcastMouseLocation(pointerData, button);
  };

  private handlePointerMove = (event: PointerEvent) => {
    if (!this.props.excalidrawAPI || !this.portal.isOpen() || !this.props.isOnline) return;
    const appState = this.props.excalidrawAPI.getAppState();
    const sceneCoords = viewportCoordsToSceneCoords({ clientX: event.clientX, clientY: event.clientY }, appState);
    const currentTool = appState.activeTool.type;
    const displayTool: 'laser' | 'pointer' = currentTool === 'laser' ? 'laser' : 'pointer';
    const pointerData: PointerData = { x: sceneCoords.x, y: sceneCoords.y, tool: displayTool };
    this.portal.broadcastMouseLocation(pointerData, appState.cursorButton || 'up');
  };

  /* Scene */

  private addSceneChangeListeners = () => {
    if (!this.props.excalidrawAPI) return;
    // The onChange callback from Excalidraw provides elements and appState,
    // but we'll fetch the latest scene directly to ensure we have deleted elements for versioning.
    this.unsubExcalidrawSceneChange = this.props.excalidrawAPI.onChange(
      (_elements, appState, _files) => {
        this.handleSceneChange(appState);
      }
    );
  };

  private removeSceneChangeListeners = () => {
    if (this.unsubExcalidrawSceneChange) {
      this.unsubExcalidrawSceneChange();
      this.unsubExcalidrawSceneChange = null;
    }
  };

  private handleSceneChange = (currentAppState: AppState) => {
    if (!this.props.excalidrawAPI || !this.portal.isOpen() || !this.props.isOnline) {
      return;
    }

    // Broadcast AppState update
    if (currentAppState) {
      this.debouncedBroadcastAppState(currentAppState);
    }

    // Broadcast Scene (elements) update
    const allCurrentElements = this.props.excalidrawAPI.getSceneElementsIncludingDeleted();
    const currentSceneVersion = getSceneVersion(allCurrentElements);

    if (allCurrentElements.length === 0 && this.isInitialLoad) {
      // No elements in the scene is the temporary scene
      return;
    }

    // Handle version initialization (either fresh pad or loading from backend)
    if (this.lastBroadcastedSceneVersion === -1 || this.state.lastProcessedSceneVersion === -1) {
      // Initialize versions
      this.lastBroadcastedSceneVersion = currentSceneVersion;
      this.setState({ lastProcessedSceneVersion: currentSceneVersion });

      // Only broadcast if this is NOT an initial load (i.e., it's a genuinely fresh pad with user changes)
      // and there are elements to broadcast
      if (!this.isInitialLoad && allCurrentElements.length > 0) {
        this.portal.broadcastSceneUpdate('SCENE_UPDATE', allCurrentElements, false);
      }

      // Mark initial load as complete if it was an initial load
      if (this.isInitialLoad) {
        this.isInitialLoad = false;
      }

      return;
    }

    // Avoid broadcasting if the scene version hasn't actually increased from what this client last broadcasted
    // and isn't newer than what this client last processed from a remote update (prevents echo).
    if (currentSceneVersion > this.lastBroadcastedSceneVersion && currentSceneVersion > this.state.lastProcessedSceneVersion) {
      // Send only changed elements (syncAll: false)
      this.portal.broadcastSceneUpdate('SCENE_UPDATE', allCurrentElements, false);
      this.lastBroadcastedSceneVersion = currentSceneVersion;
    }
    // Note: If currentSceneVersion <= this.lastBroadcastedSceneVersion but > this.state.lastProcessedSceneVersion,
    // it might indicate an undo/redo or a local change that didn't increment element versions.
    // The current logic avoids broadcasting in this specific case to prevent potential loops,
    // relying on the periodic full sync to eventually correct any minor inconsistencies.
  };

  /* Collaborators */

  private updateUsername = (user: UserInfo | null) => {
    const newUsername = user?.username || user?.id || "";
    if (this.state.username !== newUsername) {
      this.setState({ username: newUsername });
    }
  };

  private updateExcalidrawCollaborators = () => {
    if (!this.props.excalidrawAPI) return;
    const excalidrawCollaborators = new Map<SocketId, ExcalidrawCollaboratorType>();
    if (this.props.isOnline) {
      this.state.collaborators.forEach((collab, id) => {
        if (this.props.user && this.props.user.id === collab.id) return;

        excalidrawCollaborators.set(id, {
          id: collab.id,
          pointer: collab.pointer,
          username: collab.username,
          button: collab.button,
          selectedElementIds:
            collab.selectedElementIds,
          color: collab.color,
          avatarUrl: collab.avatarUrl,
        });
      });
    }
    this.props.excalidrawAPI.updateScene({ collaborators: excalidrawCollaborators });
  };

  /* Portal & Core logic */

  handlePortalStatusChange = (status: ConnectionStatus, message?: string) => {
    this.setState({ connectionStatus: status });
    // Potentially update UI or take actions based on status
    if (status === 'Failed' || (status === 'Closed' && !this.portal.isOpen())) {
      // Clear collaborators if connection is definitively lost
      this.setState({ collaborators: new Map() }, () => {
        if (this.updateExcalidrawCollaborators) this.updateExcalidrawCollaborators();
      });
    }
  };

  public handlePortalMessage = (message: WebSocketMessage) => {
    const { type, connection_id, user_id, data: messageData } = message;
    const senderIdString = connection_id || user_id;

    if (this.props.user?.id && senderIdString === this.props.user.id) return;
    if (!senderIdString) return;
    const senderId = senderIdString as SocketId;

    switch (type) {
      case 'user_joined': {
        const username = messageData?.username || senderIdString;
        console.debug(`[pad.ws] User joined: ${username}`);
        this.setState(prevState => {
          if (prevState.collaborators.has(senderId) || (this.props.user?.id && senderIdString === this.props.user.id)) return null;
          const newCollaborator: Collaborator = {
            id: user_id as SocketId,
            username: username,
            pointer: { x: 0, y: 0, tool: 'pointer' },
            color: getRandomCollaboratorColor(),
            userState: 'active',
          };
          const newCollaborators = new Map(prevState.collaborators);
          newCollaborators.set(user_id as SocketId, newCollaborator);
          return { collaborators: newCollaborators };
        });
        break;
      }
      case 'user_left': {
        console.debug(`[pad.ws] User left: ${user_id}`);
        this.setState(prevState => {
          if (!prevState.collaborators.has(user_id as SocketId) || (this.props.user?.id && user_id === this.props.user.id)) return null;
          const newCollaborators = new Map(prevState.collaborators);
          newCollaborators.delete(user_id as SocketId);
          return { collaborators: newCollaborators };
        });
        break;
      }
      case 'pointer_update': {
        if (!messageData?.pointer) return;
        const pointerDataIn = messageData.pointer as PointerData;
        if (messageData.button) pointerDataIn.button = messageData.button;
        this.setState(prevState => {
          const newCollaborators = new Map(prevState.collaborators);
          const existing = newCollaborators.get(user_id);
          const updatedCollaborator: Collaborator = {
            ...(existing as Collaborator),
            pointer: pointerDataIn,
            button: pointerDataIn.button
          };
          newCollaborators.set(user_id, updatedCollaborator);
          return { collaborators: newCollaborators };
        });
        break;
      }
      case 'scene_update': {
        const remoteElements = messageData?.elements as ExcalidrawElementType[] | undefined;

        if (remoteElements !== undefined && this.props.excalidrawAPI) {
          console.debug(`[pad.ws] Received scene update. Elements count: ${remoteElements.length}`, remoteElements);
          const localElements = this.props.excalidrawAPI.getSceneElementsIncludingDeleted();
          const currentAppState = this.props.excalidrawAPI.getAppState();

          // Ensure elements are properly restored (e.g., if they are plain objects from JSON)
          const restoredRemoteElements = restoreElements(remoteElements, null);

          const reconciled = reconcileElements(
            localElements,
            restoredRemoteElements as any[], // Cast as any if type conflicts, ensure it matches Excalidraw's expected RemoteExcalidrawElement[]
            currentAppState
          );

          this.props.excalidrawAPI.updateScene({ elements: reconciled as ExcalidrawElementType[], commitToHistory: false });

          const reconciledVersion = getSceneVersion(reconciled);
          this.setState({ lastProcessedSceneVersion: reconciledVersion });

          // If this is a fresh pad (lastBroadcastedSceneVersion is -1), initialize it
          if (this.lastBroadcastedSceneVersion === -1) {
            console.debug('[pad.ws] Initializing lastBroadcastedSceneVersion from remote scene update');
            this.lastBroadcastedSceneVersion = reconciledVersion;
            // Mark initial load as complete since we received remote data
            this.isInitialLoad = false;
          }
        }
        break;
      }
      case 'connected': {
        const collaboratorsList = messageData?.collaboratorsList as any | undefined;

        if (collaboratorsList && Array.isArray(collaboratorsList)) {
          console.debug(`[pad.ws] Received 'connected' message with ${collaboratorsList.length} collaborators.`);
          this.setState(prevState => {
            const newCollaborators = new Map<SocketId, Collaborator>();
            collaboratorsList.forEach(collabData => {

              console.debug(`[pad.ws] Collaborator data: ${JSON.stringify(collabData)}`);
              if (collabData.user_id && collabData.user_id !== this.props.user?.id) {

                const newCollaborator: Collaborator = {
                  id: collabData.user_id as SocketId,
                  username: collabData.username,
                  pointer: collabData.pointer || { x: 0, y: 0, tool: 'pointer' },
                  button: collabData.button || 'up',
                  selectedElementIds: collabData.selectedElementIds || {},
                  userState: collabData.userState || 'active',
                  color: collabData.color || getRandomCollaboratorColor(),
                  avatarUrl: collabData.avatarUrl || '',
                };
                newCollaborators.set(collabData.user_id as SocketId, newCollaborator);
              }
            });

            return { collaborators: newCollaborators };
          });
        } else {
          console.warn("[pad.ws] 'connected' message received without valid collaboratorsList.", messageData);
        }
        break;
      }
      default:
        console.warn(`Unknown message type received: ${type}`, messageData);
    }
  };

  render() {
    return null;
  }
}

export default Collab;
