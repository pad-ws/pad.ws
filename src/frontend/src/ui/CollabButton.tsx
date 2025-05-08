import React, { useState, useEffect, useCallback } from "react";
import "./CollabButton.scss";
import { setRoomEmitterInfo } from "../lib/room"; // Assuming emitter info is set elsewhere or a default is used
import { useUserProfile } from "../api/hooks";

// Placeholder for actual WebSocket connection logic
// This would ideally be in a separate service or in room.ts
let ws: WebSocket | null = null;

const CollabButton: React.FC<{ excalidrawAPI: any }> = ({ excalidrawAPI }) => {
  const [roomId, setRoomId] = useState<string>("test-room");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const { data: userProfile } = useUserProfile();
  const userId = userProfile?.id;

  useEffect(() => {
    // Set emitter info for outgoing events when userProfile is available
    if (userProfile && userId) { // Check both for clarity and safety
      setRoomEmitterInfo(userId, userProfile.given_name, userProfile.username);
    }
  }, [userId, userProfile]); // Add userProfile to dependencies

  const handleConnect = useCallback(() => {
    if (!roomId.trim()) {
      alert("Please enter a Room ID.");
      return;
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log("Already connected.");
      return;
    }

    // Ensure userId is set
    if (!userId) {
      console.error("User ID not set, cannot connect.");
      alert("User ID not available. Please ensure you are logged in and try again.");
      return;
    }
    
    // Update emitter info in room.ts before connecting
    // This ensures outgoing messages from this client will have the correct userId
    // userId is confirmed to be non-null by a check above this block.
    // userProfile should also be available.
    if (userProfile) {
      setRoomEmitterInfo(userId!, userProfile.given_name, userProfile.username);
    } else {
      // This should ideally not happen if userId is present.
      // If it does, it indicates an inconsistent state or a race condition.
      console.error("User profile not available when trying to set emitter info for connection. Aborting connection.");
      alert("User profile information is missing. Cannot connect to collaboration room.");
      return; // Prevent connection if we can't set emitter info
    }

    const wsUrl = `wss://alex.pad.ws/ws/collab/${roomId.trim()}`;
    console.log(`Attempting to connect to WebSocket: ${wsUrl} with userId: ${userId}`);
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log(`Connected to room: ${roomId}`);
      setIsConnected(true);
      // Optionally send a join message or user info
      // ws?.send(JSON.stringify({ type: "user_join", userId }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);
        console.log("Received message:", message);

        // Dispatch as a custom event for room.ts to handle
        // This re-uses the existing logic in setupCollabEventReceiver
        if (message.emitter?.userId !== userId) { // Basic check to avoid self-echo if server doesn't filter
          const collabEvent = new CustomEvent('collabEvent', { detail: message });
          document.dispatchEvent(collabEvent);
        }
      } catch (error) {
        console.error("Failed to parse incoming message or dispatch event:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      alert(`WebSocket error. Check console.`);
      setIsConnected(false); // Ensure UI reflects connection failure
    };

    ws.onclose = (event) => {
      console.log(`Disconnected from room: ${roomId}. Code: ${event.code}, Reason: ${event.reason}`);
      setIsConnected(false);
      ws = null;
    };
  }, [roomId, userId]);

  const handleDisconnect = () => {
    if (ws) {
      ws.close();
    }
    setIsConnected(false);
  };

  const handleSendMessage = useCallback((message: any) => {
    if (ws && ws.readyState === WebSocket.OPEN && userId) {
      // Add emitter info if not already present (room.ts might do this too)
      const messageWithEmitter = {
        ...message,
        emitter: message.emitter || { userId } 
      };
      ws.send(JSON.stringify(messageWithEmitter));
    } else {
      console.warn("WebSocket not connected or userId not available. Cannot send message.");
    }
  }, [userId]);

  // Listen to 'collabEvent' from room.ts and send it via WebSocket
  useEffect(() => {
    const eventListener = (event: Event) => {
      if (event instanceof CustomEvent && event.detail && isConnected && userId) {
        // Only send if this client is the emitter (or if emitter info is not set by room.ts for some reason)
        // room.ts should set the emitter, so we check if it matches our userId
        if (event.detail.emitter?.userId === userId) {
           handleSendMessage(event.detail);
        }
      }
    };
    document.addEventListener('collabEvent', eventListener);
    return () => {
      document.removeEventListener('collabEvent', eventListener);
    };
  }, [isConnected, userId, handleSendMessage]);


  return (
    <div className="collab-button-container">
      <input
        type="text"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
        placeholder="Room ID"
        disabled={isConnected}
        className="collab-room-input"
      />
      {isConnected ? (
        <button onClick={handleDisconnect} className="collab-button disconnect">
          Disconnect
        </button>
      ) : (
        <button onClick={handleConnect} className="collab-button connect">
          Connect
        </button>
      )}
    </div>
  );
};

export default CollabButton;
