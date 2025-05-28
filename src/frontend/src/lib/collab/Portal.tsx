import { z } from 'zod';
import type Collab from './Collab';
import type { OrderedExcalidrawElement } from '@atyrode/excalidraw/element/types';
import type { AppState } from '@atyrode/excalidraw/types';
import type { UserInfo } from '../../hooks/useAuthStatus'; // For user details

export const WebSocketMessageSchema = z.object({
  type: z.string(),
  pad_id: z.string().nullable(),
  timestamp: z.string().datetime({ offset: true, message: "Invalid timestamp format" }),
  user_id: z.string().optional(),
  connection_id: z.string().optional(),
  data: z.any().optional(),
});
export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;

export type ConnectionStatus = 'Uninstantiated' | 'Connecting' | 'Open' | 'Closing' | 'Closed' | 'Reconnecting' | 'Failed';

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000; // 1 second

class Portal {
  private collab: Collab;
  private socket: WebSocket | null = null;
  private roomId: string | null = null; // This will be the padId

  // Auth and connection state
  private user: UserInfo | null = null;
  private isAuthenticated: boolean = false;
  private isLoadingAuth: boolean = true; // Start with true until first auth update

  private reconnectAttemptCount: number = 0;
  private isPermanentlyDisconnected: boolean = false;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private currentConnectionStatus: ConnectionStatus = 'Uninstantiated';

  // Callback for Collab to react to status changes
  private onStatusChange: ((status: ConnectionStatus, message?: string) => void) | null = null;
  private onMessage: ((message: WebSocketMessage) => void) | null = null;


  broadcastedElementVersions: Map<string, number> = new Map();

  constructor(
    collab: Collab,
    padId: string | null,
    user: UserInfo | null,
    isAuthenticated: boolean,
    isLoadingAuth: boolean,
    onStatusChange?: (status: ConnectionStatus, message?: string) => void,
    onMessage?: (message: WebSocketMessage) => void,
  ) {
    this.collab = collab;
    this.roomId = padId;
    this.user = user;
    this.isAuthenticated = isAuthenticated;
    this.isLoadingAuth = isLoadingAuth;
    if (onStatusChange) this.onStatusChange = onStatusChange;
    if (onMessage) this.onMessage = onMessage;  }

  public initiate(): void {
    if (!this.onStatusChange && (this.roomId || this.currentConnectionStatus !== 'Uninstantiated')) {
      console.warn("[Portal] initiate called before onStatusChange callback was set, or logic error.");
    }

    if (this.roomId) {
      this.connect();
    } else {
      // If Collab's initial state.connectionStatus is 'Uninstantiated'
      // and Portal's this.currentConnectionStatus is also 'Uninstantiated' (its default),
      // this call to _updateStatus will not trigger onStatusChange due to the
      // "if (this.currentConnectionStatus !== status)" check within _updateStatus.
      // This is safe and ensures status consistency if padId is null.
      this._updateStatus('Uninstantiated');
    }
  }

  private _updateStatus(status: ConnectionStatus, message?: string) {
    if (this.currentConnectionStatus !== status) {
      this.currentConnectionStatus = status;
      console.debug(`[pad.ws] Status changed to: ${status}${message ? ` (${message})` : ''}`);
      if (this.onStatusChange) {
        this.onStatusChange(status, message);
      }
    }
  }

  public getStatus(): ConnectionStatus {
    return this.currentConnectionStatus;
  }

  public getPadId(): string | null {
    return this.roomId;
  }

  private getSocketUrl(): string | null {
    if (!this.roomId || this.roomId.startsWith('temp-')) {
      return null;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws/pad/${this.roomId}`;
  }

  private shouldBeConnected(): boolean {
    return !!this.getSocketUrl() && this.isAuthenticated && !this.isLoadingAuth && !this.isPermanentlyDisconnected;
  }

  public connect(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.debug('[pad.ws] Already connected.');
      return;
    }
    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      console.debug('[pad.ws] Already connecting.');
      return;
    }

    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    if (!this.shouldBeConnected()) {
      console.debug('[pad.ws] Conditions not met for connection.');
      this._updateStatus(this.isPermanentlyDisconnected ? 'Failed' : 'Closed');
      return;
    }

    const socketUrl = this.getSocketUrl();
    if (!socketUrl) {
      console.error('[pad.ws] Cannot connect: Socket URL is invalid.');
      this._updateStatus('Failed', 'Invalid URL');
      return;
    }

    this._updateStatus(this.reconnectAttemptCount > 0 ? 'Reconnecting' : 'Connecting');
    console.debug(`[pad.ws] Attempting to connect to: ${socketUrl}`);
    this.socket = new WebSocket(socketUrl);

    this.socket.onopen = () => {
      console.debug(`[pad.ws] Connection established for pad: ${this.roomId}`);
      this.isPermanentlyDisconnected = false;
      this.reconnectAttemptCount = 0;
      if (this.reconnectTimeoutId) clearTimeout(this.reconnectTimeoutId);
      this._updateStatus('Open');
    };

    this.socket.onmessage = (event: MessageEvent) => {
      try {
        const parsedData = JSON.parse(event.data as string);
        const validationResult = WebSocketMessageSchema.safeParse(parsedData);
        if (validationResult.success) {
          if (this.onMessage) {
            this.onMessage(validationResult.data);
          } else {
            // Fallback to direct call if onMessage prop not set by Collab
            this.collab.handlePortalMessage(validationResult.data);
          }
        } else {
          console.error(`[pad.ws] Incoming message validation failed for pad ${this.roomId}:`, validationResult.error.issues);
          console.error(`[pad.ws] Raw message: ${event.data}`);
        }
      } catch (error) {
        console.error(`[pad.ws] Error parsing incoming JSON message for pad ${this.roomId}:`, error);
      }
    };

    this.socket.onclose = (event: CloseEvent) => {
      console.debug(`[pad.ws] Connection closed for pad: ${this.roomId}. Code: ${event.code}, Reason: '${event.reason}'`);
      this.socket = null; // Clear the socket instance

      const isAbnormalClosure = event.code !== 1000 && event.code !== 1001; // 1000 = Normal, 1001 = Going Away

      if (this.isPermanentlyDisconnected) {
         this._updateStatus('Failed', `Permanently disconnected. Code: ${event.code}`);
         return;
      }

      if (isAbnormalClosure && this.shouldBeConnected()) {
        this.reconnectAttemptCount++;
        if (this.reconnectAttemptCount > MAX_RECONNECT_ATTEMPTS) {
          console.warn(`[pad.ws] Failed to reconnect to pad ${this.roomId} after ${this.reconnectAttemptCount -1} attempts. Stopping.`);
          this.isPermanentlyDisconnected = true;
          this._updateStatus('Failed', `Max reconnect attempts reached.`);
        } else {
          const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, this.reconnectAttemptCount -1);
          console.debug(`[pad.ws] Reconnecting attempt ${this.reconnectAttemptCount}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms for pad: ${this.roomId}`);
          this._updateStatus('Reconnecting', `Attempt ${this.reconnectAttemptCount}`);
          this.reconnectTimeoutId = setTimeout(() => this.connect(), delay);
        }
      } else {
        this._updateStatus('Closed', `Code: ${event.code}`);
      }
    };

    this.socket.onerror = (event: Event) => {
      console.error(`[pad.ws] WebSocket error for pad: ${this.roomId}:`, event);
      this._updateStatus('Failed', 'WebSocket error');
    };
  }

  public disconnect(): void {
    console.debug(`[pad.ws] Disconnecting from pad: ${this.roomId}`);
    this.isPermanentlyDisconnected = true; // Mark intent to disconnect this session

    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    const socketToClose = this.socket; // Capture the current socket reference
    this.socket = null; // Nullify the instance's main socket reference immediately

    if (socketToClose) {
      // Detach all handlers from the old socket.
      // This is crucial to prevent its onclose (and other) handlers from
      // executing and potentially interfering with the state of the Portal instance,
      // which is now focused on a new connection or a definitive closed state.
      socketToClose.onopen = null;
      socketToClose.onmessage = null;
      socketToClose.onclose = null; // <--- Key change: prevent our generic onclose
      socketToClose.onerror = null;

      // Only attempt to close if it's in a state that can be closed.
      if (socketToClose.readyState === WebSocket.OPEN || socketToClose.readyState === WebSocket.CONNECTING) {
        try {
          socketToClose.close(1000, 'Client initiated disconnect');
        } catch (e) {
          console.warn(`[pad.ws] Error while closing socket for pad ${this.roomId}:`, e);
        }
      } else {
        console.debug(`[pad.ws] Socket for pad ${this.roomId} was not OPEN or CONNECTING. Current state: ${socketToClose.readyState}. No explicit close call needed.`);
      }
    }

    // This status update reflects the client's *action* to disconnect.
    // The actual closure of the socket on the wire is handled by socketToClose.close().
    this._updateStatus('Closed', 'Client initiated disconnect');
  }
  
  public closePortal(): void { // Renamed from 'close' to avoid conflict with WebSocket.close
    this.disconnect(); // For now, closing the portal means disconnecting.
    this.roomId = null;
    this.broadcastedElementVersions.clear();
    this.onStatusChange = null;
    this.onMessage = null;
  }

  public updatePadId(padId: string | null): void {
    if (this.roomId === padId) return;

    this.disconnect(); // Disconnect from the old pad
    this.roomId = padId;
    this.isPermanentlyDisconnected = false; // Reset for new pad
    this.reconnectAttemptCount = 0;
    
    if (this.roomId) {
      this.connect();
    } else {
      this._updateStatus('Uninstantiated');
    }
  }
  
  public updateAuthInfo(user: UserInfo | null, isAuthenticated: boolean, isLoadingAuth: boolean): void {
    const oldShouldBeConnected = this.shouldBeConnected();
    this.user = user;
    this.isAuthenticated = isAuthenticated;
    this.isLoadingAuth = isLoadingAuth;
    const newShouldBeConnected = this.shouldBeConnected();

    if (oldShouldBeConnected !== newShouldBeConnected) {
      if (newShouldBeConnected) {
        console.debug('[pad.ws] Auth state changed, attempting to connect/reconnect.');
        this.isPermanentlyDisconnected = false; // Allow reconnection attempts if auth is now valid
        this.reconnectAttemptCount = 0; // Reset attempts
        this.connect();
      } else {
        console.debug('[pad.ws] Auth state changed, disconnecting.');
        this.disconnect(); // Disconnect if auth conditions no longer met
      }
    }
  }

  public isOpen(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  private sendJsonMessage(payload: WebSocketMessage): void {
    if (!this.isOpen()) {
      console.warn('[pad.ws] Cannot send message: WebSocket is not open.', payload.type);
      return;
    }
    const validationResult = WebSocketMessageSchema.safeParse(payload);
    if (!validationResult.success) {
      console.error(`[pad.ws] Outgoing message validation failed for pad ${this.roomId}:`, validationResult.error.issues);
      return;
    }
    this.socket?.send(JSON.stringify(payload));
  }

  public sendMessage(type: string, data?: any): void {
    const messagePayload: WebSocketMessage = {
      type,
      pad_id: this.roomId,
      timestamp: new Date().toISOString(),
      user_id: this.user?.id,
      data: data,
    };
    if (messagePayload.type != 'pointer_update') {
      console.debug(`[pad.ws] Sending message of type: ${messagePayload.type} for pad ${this.roomId}`, messagePayload);
    }
    this.sendJsonMessage(messagePayload);
  }

  public broadcastMouseLocation = (
    pointerData: { x: number; y: number; tool: 'laser' | 'pointer' },
    button?: 'up' | 'down',
  ) => {
    const payload = {
      pointer: pointerData,
      button: button || 'up',
    };
    this.sendMessage('pointer_update', payload);
  };

  public broadcastSceneUpdate = (
    updateType: 'SCENE_INIT' | 'SCENE_UPDATE',
    elements: ReadonlyArray<OrderedExcalidrawElement>,
    syncAll: boolean
  ) => {
    let elementsToSend = elements;

    if (!syncAll) {
      // Filter elements to send only those that have changed since last broadcast
      elementsToSend = elements.filter(element => {
        const lastBroadcastedVersion = this.broadcastedElementVersions.get(element.id) || -1;
        return element.version > lastBroadcastedVersion;
      });
    }

    const payload = {
      update_subtype: updateType,
      elements: elementsToSend,
      // appState: if sending app state changes
    };

    if (elementsToSend.length > 0 || syncAll) {
       this.sendMessage('scene_update', payload);

      // Update broadcasted versions for the elements that were actually sent
      elementsToSend.forEach(element => {
        if (element && typeof element.id === 'string' && typeof element.version === 'number') {
          this.broadcastedElementVersions.set(element.id, element.version);
        }
      });
    }


    if (syncAll) {
      // Clear versions on full sync to ensure all elements are tracked again
      this.broadcastedElementVersions.clear();
       elements.forEach(element => {
        if (element && typeof element.id === 'string' && typeof element.version === 'number') {
          this.broadcastedElementVersions.set(element.id, element.version);
        }
      });
    }
  };

  public broadcastAppStateUpdate = (appState: AppState): void => {
    const payload = {
      appState: appState,
    };
    this.sendMessage('appstate_update', payload);
  };
}

export default Portal;
