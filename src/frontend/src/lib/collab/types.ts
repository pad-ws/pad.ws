import type { NonDeletedExcalidrawElement } from "@atyrode/excalidraw/element/types";
import type { AppState } from "@atyrode/excalidraw/types";

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
