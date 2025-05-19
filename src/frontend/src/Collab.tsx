import React, { useEffect } from 'react';
import type { ExcalidrawImperativeAPI, AppState, Collaborator as ExcalidrawCollaborator } from "@atyrode/excalidraw/types";
import { WebSocketMessage } from "./hooks/usePadWebSocket"; // Assuming this is the correct path and type

// Moved Types
export interface Collaborator {
  id: string;
  pointer?: { x: number; y: number };
  button?: "up" | "down";
  selectedElementIds?: AppState["selectedElementIds"];
  username?: string | null;
  userState?: "active" | "away" | "idle";
  color?: { background: string; stroke: string };
  avatarUrl?: string | null;
}

// Specific data payload for 'user_joined' WebSocket messages
// These types reflect the direct properties on lastJsonMessage for these events
export interface UserJoinedMessage extends WebSocketMessage { // Extend or use a more specific type if available
  type: "user_joined";
  user_id: string;
  connection_id: string; 
  displayName?: string; 
}

// Specific data payload for 'user_left' WebSocket messages
export interface UserLeftMessage extends WebSocketMessage { // Extend or use a more specific type if available
  type: "user_left";
  user_id: string;
  connection_id: string; 
}

// ConnectedData is also moved here, though not directly used in the primary effect.
export interface ConnectedData {
  pad_id: string;
  user_id: string;
  connection_id: string;
  timestamp: string;
}

// Props for the Collab component
interface CollabProps {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  lastJsonMessage: WebSocketMessage | null; 
  userId?: string; // Current user's ID
  sendMessage: (message: WebSocketMessage) => void; // Keep if other collab features might need it
}

// Moved Helper Function
const getRandomCollaboratorColor = () => {
  const colors = [
    { background: "#FFC9C9", stroke: "#A61E1E" }, // Light Red
    { background: "#B2F2BB", stroke: "#1E7E34" }, // Light Green
    { background: "#A5D8FF", stroke: "#1C63A6" }, // Light Blue
    { background: "#FFEC99", stroke: "#A67900" }, // Light Yellow
    { background: "#E6C9FF", stroke: "#6A1E9A" }, // Light Purple
    { background: "#FFD8A8", stroke: "#A65E00" }, // Light Orange
    { background: "#C3FAFB", stroke: "#008083" }, // Light Cyan
    { background: "#F0B9DD", stroke: "#A21E6F" }, // Light Pink
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

export default function Collab({ excalidrawAPI, lastJsonMessage, userId, sendMessage }: CollabProps) {
  useEffect(() => {
    if (!lastJsonMessage || !excalidrawAPI || !userId) {
      return;
    }

    const currentAppState = excalidrawAPI.getAppState();
    // Ensure collaborators is a Map. Excalidraw might initialize it as an object.
    const collaboratorsMap = currentAppState.collaborators instanceof Map
      ? new Map(currentAppState.collaborators)
      : new Map<string, ExcalidrawCollaborator>();


    if (lastJsonMessage.type === "user_joined") {

      const { connection_id: joinedUserId, displayName } = lastJsonMessage as UserJoinedMessage; 
            
      if (!collaboratorsMap.has(joinedUserId)) {
        const newCollaborator: Collaborator = {
          id: joinedUserId,
          username: displayName || joinedUserId,
          pointer: { x: 0, y: 0 },
          button: "up",
          selectedElementIds: {},
          userState: "active",
          color: getRandomCollaboratorColor(),
        };
        collaboratorsMap.set(joinedUserId, newCollaborator as ExcalidrawCollaborator);
        excalidrawAPI.updateScene({ appState: { ...currentAppState, collaborators: collaboratorsMap } });
        console.log(`[Collab.tsx] User joined: ${joinedUserId}, collaborators:`, collaboratorsMap);
      }
    } else if (lastJsonMessage.type === "user_left") {

      const { connection_id: leftUserId } = lastJsonMessage as UserLeftMessage; 

      if (collaboratorsMap.has(leftUserId)) {
        collaboratorsMap.delete(leftUserId);
        excalidrawAPI.updateScene({ appState: { ...currentAppState, collaborators: collaboratorsMap } });
        console.log(`[Collab.tsx] User left: ${leftUserId}, collaborators:`, collaboratorsMap);
      }
    }
  }, [lastJsonMessage, excalidrawAPI, userId]);

  return null; 
}
