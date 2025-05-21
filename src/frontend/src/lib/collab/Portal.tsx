import Collab from './Collab'; // Corrected import
// import type { UserIdleState } from '@atyrode/excalidraw/common'; // If using Excalidraw types - REMOVED
import type { OrderedExcalidrawElement } from '@atyrode/excalidraw/element/types';
import type { OnUserFollowedPayload, SocketId } from '@atyrode/excalidraw/types';
// Import WebSocketMessage type from usePadWebSocket, assuming it's accessible
// If not, we might need to define a similar structure or pass it through props.
// For now, let's assume a generic message structure for incoming messages.
import type { WebSocketMessage } from '../../hooks/usePadWebSocket';


// Define your WebSocket event subtypes if they differ from Excalidraw's
// export const WS_SUBTYPES = { ... };

// Define your own data structures for socket messages if they differ
// export interface SocketUpdateDataSource { ... } // For structured data before sending
// export interface SocketUpdateData { ... } // For the actual data sent over WS

// Type for the sendMessage function passed from usePadWebSocket
export type SendMessageFn = (type: string, data?: any) => void;

// Type for the handler that Collab class will use to process messages from Portal
export type MessageHandlerFn = (message: WebSocketMessage) => void;

class Portal {
  private collab: Collab;
  private sendMessageFn: SendMessageFn;
  private messageHandler: MessageHandlerFn | null = null;

  // We don't manage a raw socket object here anymore.
  // Instead, we rely on the sendMessageFn and a mechanism to receive messages.
  socketInitialized: boolean = false; // Represents if the portal is ready to send/receive
  roomId: string | null = null; // This will be the padId
  // roomKey: string | null = null; // For encryption, if you implement it - not used for now

  broadcastedElementVersions: Map<string, number> = new Map();

  constructor(collab: Collab, sendMessageFn: SendMessageFn, padId: string | null) {
    this.collab = collab;
    this.sendMessageFn = sendMessageFn;
    this.roomId = padId;
    // this.roomKey = roomKey; // If we were to use encryption keys
    this.socketInitialized = !!padId; // Consider it initialized if we have a padId
  }

  // Method for Collab class to register its message handler
  setMessageHandler(handler: MessageHandlerFn) {
    this.messageHandler = handler;
  }

  // Method for Collab class to push incoming messages from props into the Portal
  public handleIncomingMessage(message: WebSocketMessage) {
    if (this.messageHandler) {
      // Here, Portal might do some initial processing/filtering if needed,
      // or directly pass it to the Collab's handler.
      // For now, direct pass-through.
      this.messageHandler(message);
    }
  }


  // open(socket: any, id: string, key: string) { // Replace 'any'
  //   this.socket = socket;
  //   this.roomId = id;
  //   this.roomKey = key; // Store if using for encryption
  //   // No direct socket event listeners here anymore.
  //   // Message handling will be via handleIncomingMessage
  //   this.socketInitialized = true;
  //   return socket;
  // }
  
  // The concept of "opening" and "closing" the portal is now tied to
  // whether it's been provided with a sendMessage function and a padId.
  // And when the Collab component unmounts or padId changes.

  // Call this when the collaboration stops or padId becomes null
  public close() {
    // this.queueFileUpload.flush(); // If you implement a similar queue
    this.roomId = null;
    // this.roomKey = null;
    this.socketInitialized = false;
    this.broadcastedElementVersions = new Map();
    this.messageHandler = null; // Clear handler
    // No actual socket.close() as we don't own the socket.
    // The usePadWebSocket hook handles the actual socket lifecycle.
  }

  public updatePadId(padId: string | null) {
    this.roomId = padId;
    this.socketInitialized = !!padId;
    if (!padId) {
        this.broadcastedElementVersions.clear();
    }
  }


  isOpen() {
    return !!(
      this.socketInitialized &&
      this.sendMessageFn && // We need a way to send messages
      this.roomId
    );
  }

  // async _broadcastSocketData(
  //   data: SocketUpdateData, // Your defined type
  //   volatile: boolean = false,
  //   roomId?: string,
  // ) {
  //   if (this.isOpen()) {
  //     // Encryption logic here if used (like Excalidraw's encryptData)
  //     const jsonData = JSON.stringify(data);
  //     // this.socket?.emit( eventName, roomId ?? this.roomId, encryptedData, iv);
  //     this.socket?.emit('server-message', roomId ?? this.roomId, jsonData); // Example
  //   }
  // }

  // broadcastScene = async (
  //   updateType: string, // e.g., 'INIT' or 'UPDATE'
  //   elements: readonly OrderedExcalidrawElement[],
  //   syncAll: boolean,
  // ) => {
  //   // Logic to filter syncableElements based on version and syncAll
  //   // Construct payload
  //   // await this._broadcastSocketData(data);
  // };

  // broadcastIdleChange = (userState: UserIdleState) => {
  //   // Construct payload
  //   // return this._broadcastSocketData(data, true); // true for volatile
  // };

  // broadcastMouseLocation = (payload: { /* ... */ }) => {
  //   // Construct payload
  //   // return this._broadcastSocketData(data, true);
  // };

  // broadcastUserFollowed = (payload: OnUserFollowedPayload) => {
  //   // this.socket?.emit('user_follow_change', payload);
  // };

  // --- Broadcast Methods ---
  // Import PointerData from Collab.tsx or define it here if it's to be kept separate.
  // For now, assuming Collab.tsx will export it or we define it locally if preferred.
  // Let's assume Collab.tsx exports it for this example.
  // We'll need to adjust Collab.tsx to export PointerData if it doesn't already.
  // For now, to avoid circular dependency issues if Collab imports Portal,
  // let's duplicate a simplified PointerData here or use 'any' and refine.
  // To keep it simple for now, I'll use 'any' and we can pass the structured object from Collab.
  public broadcastMouseLocation = (
    pointerData: { x: number; y: number; tool: 'laser' | 'pointer' }, // More specific than 'any'
    button?: 'up' | 'down', 
    // selectedElementIds?: Record<string, boolean> // Add if needed
    // username?: string // Add if needed
  ) => {
    if (!this.isOpen()) return;

    // Construct the payload similar to Excalidraw or useCollabManager
    // The actual message 'type' (e.g., 'pointer_update', 'MOUSE_LOCATION')
    // and payload structure will depend on your WebSocket backend.
    // For now, let's assume a 'pointer_update' type.
    const payload = {
      pointer: pointerData,
      button: button || 'up', // Default to 'up' if not provided
      // selectedElementIds: selectedElementIds, // If you send this
      // username: this.collab.state.username, // Collab instance would need to expose username or pass it
    };
    // The 'collab' instance is available via this.collab
    // We might need to pass the username from Collab state or props
    // For now, sending a simplified payload.
    this.sendMessageFn('pointer_update', payload);
  };

  // Add other broadcast methods here:
  public broadcastSceneUpdate = (
    updateType: 'SCENE_INIT' | 'SCENE_UPDATE', // Similar to Excalidraw's WS_SUBTYPES
    elements: ReadonlyArray<any /*ExcalidrawElementType*/>, // Using any for now
    syncAll: boolean // To indicate if all elements are being sent (for INIT or full sync)
  ) => {
    if (!this.isOpen()) return;

    // In a real scenario, you'd filter elements if not syncAll,
    // based on version against this.broadcastedElementVersions.
    // For now, we'll send all elements passed.
    // Excalidraw's Portal has more sophisticated logic here.

    const payload = {
      type: updateType, // This is an Excalidraw-specific subtype, our backend might expect a different top-level 'type'
      elements: elements,
      // appState: if sending app state changes
    };

    // The actual message 'type' sent to backend (e.g., 'scene_changed', 'elements_update')
    // will depend on your WebSocket backend's expected message structure.
    // Let's assume a generic 'scene_update' that carries the payload.
    this.sendMessageFn('scene_update', payload);

    // Update broadcasted versions if needed (more complex logic for partial updates)
    if (syncAll) {
      this.broadcastedElementVersions.clear();
    }
    elements.forEach(element => {
      if (element && typeof element.id === 'string' && typeof element.version === 'number') {
        this.broadcastedElementVersions.set(element.id, element.version);
      }
    });
  };

  // broadcastIdleChange(userState: UserIdleState) { ... }
  // broadcastUserFollowed(payload: OnUserFollowedPayload) { ... }

}

export default Portal;
