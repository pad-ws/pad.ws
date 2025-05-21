import React, { PureComponent } from 'react';
import type { ExcalidrawImperativeAPI, AppState, SocketId, Collaborator as ExcalidrawCollaboratorType } from '@atyrode/excalidraw/types';
import type { ExcalidrawElement as ExcalidrawElementType } from '@atyrode/excalidraw/element/types';
import { viewportCoordsToSceneCoords, getSceneVersion, reconcileElements, restoreElements } from '@atyrode/excalidraw';
import throttle from 'lodash.throttle'; 

import Portal from './Portal';
import type { WebSocketMessage, ConnectionStatus } from './Portal';
import type { UserInfo } from '../../hooks/useAuthStatus';

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

const POINTER_MOVE_THROTTLE_MS = 20;

class Collab extends PureComponent<CollabProps, CollabState> {
  [x: string]: any;
  readonly state: CollabState;
  private portal: Portal;
  
  private throttledOnPointerMove: any; 
  private unsubExcalidrawPointerDown: (() => void) | null = null;
  private unsubExcalidrawPointerUp: (() => void) | null = null;
  private unsubExcalidrawSceneChange: (() => void) | null = null;

  // To track the scene version last broadcast by this client
  private lastBroadcastedSceneVersion: number = -1;
  props: any;
  // To track the scene version last received and processed from remote
  // This is already in state: lastProcessedSceneVersion

  constructor(props: CollabProps) {
    super(props);
    this.state = {
      errorMessage: null,
      connectionStatus: 'Uninstantiated',
      username: props.user?.username || props.user?.id || '',
      collaborators: new Map(),
      lastProcessedSceneVersion: -1, // Version of the scene after applying remote changes
    };
    // Instantiate Portal with new signature
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
  }

  // Method to handle status changes from Portal
  handlePortalStatusChange = (status: ConnectionStatus, message?: string) => {
    console.debug(`[pad.ws] Portal status changed: ${status}`, message || '');
    this.setState({ connectionStatus: status });
    // Potentially update UI or take actions based on status
    if (status === 'Failed' || (status === 'Closed' && !this.portal.isOpen())) {
        // Clear collaborators if connection is definitively lost
        this.setState({ collaborators: new Map() }, () => {
            if (this.updateExcalidrawCollaborators) this.updateExcalidrawCollaborators();
        });
    }
  };

  componentDidMount() {
    // setMessageHandler is removed, Portal gets handler via constructor
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
      this.setState({lastProcessedSceneVersion: this.lastBroadcastedSceneVersion});
    }
     if (this.props.isOnline && this.props.padId) {
      // Potentially call a method to broadcast initial scene if this client is the first or needs to sync
      // this.broadcastFullSceneUpdate(true); // Example: true for SCENE_INIT
    }
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
      this.portal.updatePadId(this.props.padId);
      this.setState({
        collaborators: new Map(),
        lastProcessedSceneVersion: -1,
        username: this.props.user?.username || this.props.user?.id || '',
        // connectionStatus will be updated by portal's callbacks
      });
      this.lastBroadcastedSceneVersion = -1;

      // Listeners might need to be re-evaluated if excalidrawAPI instance changes with padId
      // For now, assuming excalidrawAPI is stable or re-bound by parent
      if (this.props.excalidrawAPI) {
        const initialElements = this.props.excalidrawAPI.getSceneElementsIncludingDeleted();
        this.lastBroadcastedSceneVersion = getSceneVersion(initialElements);
        this.setState({ lastProcessedSceneVersion: this.lastBroadcastedSceneVersion });
      }
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
    this.removeSceneChangeListeners();
  }

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
  
  private addSceneChangeListeners = () => {
    if (!this.props.excalidrawAPI) return;
    // The onChange callback from Excalidraw provides elements and appState,
    // but we'll fetch the latest scene directly to ensure we have deleted elements for versioning.
    this.unsubExcalidrawSceneChange = this.props.excalidrawAPI.onChange(
      () => {
        this.handleSceneChange();
      }
    );
  };

  private removeSceneChangeListeners = () => {
    if (this.unsubExcalidrawSceneChange) {
      this.unsubExcalidrawSceneChange();
      this.unsubExcalidrawSceneChange = null;
    }
  };

  private handleSceneChange = () => {
    if (!this.props.excalidrawAPI || !this.portal.isOpen() || !this.props.isOnline) {
      return;
    }

    const allCurrentElements = this.props.excalidrawAPI.getSceneElementsIncludingDeleted();
    const currentSceneVersion = getSceneVersion(allCurrentElements);

    // Avoid broadcasting if:
    // 1. The scene version hasn't actually increased from what this client last broadcasted.
    // 2. The scene version isn't newer than what this client last processed from a remote update (prevents echo).
    if (currentSceneVersion > this.lastBroadcastedSceneVersion && currentSceneVersion > this.state.lastProcessedSceneVersion) {
      // Send all elements (including deleted) as Excalidraw's reconcile function handles this.
      // The `false` indicates it's not a full sync (SCENE_INIT), but a regular update.
      this.portal.broadcastSceneUpdate('SCENE_UPDATE', allCurrentElements, false);
      this.lastBroadcastedSceneVersion = currentSceneVersion;
    } else if (currentSceneVersion <= this.lastBroadcastedSceneVersion && currentSceneVersion > this.state.lastProcessedSceneVersion) {
      // This case can happen if an undo/redo operation results in a scene version that was previously broadcasted
      // but is newer than the last processed remote scene. We should still broadcast.
      // Or, if a remote update was processed, and then a local action (like selection) triggers onChange
      // without changing element versions, but we want to ensure our state is robust.
      // For simplicity now, we only broadcast if strictly newer than last broadcast.
      // More nuanced logic could be added if specific scenarios require it.
      // console.log("Scene version not strictly greater than last broadcasted, but greater than last processed. Potentially an echo or no new element changes to broadcast.");
    }
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

  // Made public to be callable by Portal instance (passed in constructor)
  public handlePortalMessage = (message: WebSocketMessage) => {
    const { type, connection_id, user_id, data: messageData } = message;
    const senderIdString = connection_id || user_id;

    if (this.props.user?.id && senderIdString === this.props.user.id) return;
    if (!senderIdString) return;
    const senderId = senderIdString as SocketId;

    switch (type) {
      case 'user_joined': {
        const displayName = messageData?.displayName || senderIdString;
        console.log(`[pad.ws] User joined: ${displayName}`);
        this.setState(prevState => {
          if (prevState.collaborators.has(senderId) || (this.props.user?.id && senderIdString === this.props.user.id)) return null;
          const newCollaborator: Collaborator = {
            id: senderId, username: displayName, pointer: { x: 0, y: 0, tool: 'pointer' },
            color: getRandomCollaboratorColor(), userState: 'active',
          };
          const newCollaborators = new Map(prevState.collaborators);
          newCollaborators.set(senderId, newCollaborator);
          return { collaborators: newCollaborators };
        });
        break;
      }
      case 'user_left': {
        const displayName = messageData?.displayName || senderIdString;
        console.log(`[pad.ws] User left: ${displayName}`);
        this.setState(prevState => {
          if (!prevState.collaborators.has(senderId) || (this.props.user?.id && senderIdString === this.props.user.id)) return null;
          const newCollaborators = new Map(prevState.collaborators);
          newCollaborators.delete(senderId);
          return { collaborators: newCollaborators };
        });
        break;
      }
      case 'pointer_update':
      case 'pointer_event': {
        if (!messageData?.pointer) return;
        const pointerDataIn = messageData.pointer as PointerData;
        if (messageData.button) pointerDataIn.button = messageData.button;
        this.setState(prevState => {
          const newCollaborators = new Map(prevState.collaborators);
          const existing = newCollaborators.get(senderId);
          if (existing && typeof existing === 'object') { // Check if existing is an object before spreading
            const updatedCollaborator: Collaborator = {
              ...(existing as Collaborator), // Cast to Collaborator to assure TS it's an object
              pointer: pointerDataIn,
              button: pointerDataIn.button
            };
            newCollaborators.set(senderId, updatedCollaborator);
          } else if (!existing) { // Only create new if it doesn't exist
            newCollaborators.set(senderId, {
              id: senderId, username: senderIdString, pointer: pointerDataIn, button: pointerDataIn.button,
              color: getRandomCollaboratorColor(), userState: 'active',
            });
          }
          return { collaborators: newCollaborators };
        });
        break;
      }
      case 'scene_update': {
        const remoteElements = messageData?.elements as ExcalidrawElementType[] | undefined;

        if (remoteElements !== undefined && this.props.excalidrawAPI) {
          const localElements = this.props.excalidrawAPI.getSceneElementsIncludingDeleted();
          const currentAppState = this.props.excalidrawAPI.getAppState();
          
          // Ensure elements are properly restored (e.g., if they are plain objects from JSON)
          const restoredRemoteElements = restoreElements(remoteElements, null);
          
          const reconciled = reconcileElements(
            localElements,
            restoredRemoteElements as any[], // Cast as any if type conflicts, ensure it matches Excalidraw's expected RemoteExcalidrawElement[]
            currentAppState
          );
          
          this.props.excalidrawAPI.updateScene({ elements: reconciled as ExcalidrawElementType[] });
          this.setState({ lastProcessedSceneVersion: getSceneVersion(reconciled) });
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
