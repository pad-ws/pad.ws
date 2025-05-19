import React from 'react';
import type { ExcalidrawImperativeAPI } from "@atyrode/excalidraw/types";
import type { UserInfo } from "./hooks/useAuthStatus";
import type { WebSocketMessage } from "./hooks/usePadWebSocket";
import { useCollabManager } from './hooks/useCollabManager';

// Props for the Collab component
interface CollabProps {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  lastJsonMessage: WebSocketMessage | null;
  user: UserInfo | null;
  sendMessage: (type: string, data?: any) => void;
  isOnline: boolean; // Added isOnline prop
}

export default function Collab({
  excalidrawAPI,
  lastJsonMessage,
  user,
  sendMessage,
  isOnline,
}: CollabProps) {
  useCollabManager({
    excalidrawAPI,
    lastJsonMessage,
    user,
    sendMessage,
    isOnline,
  });

  return null; // This component does not render anything itself
}
