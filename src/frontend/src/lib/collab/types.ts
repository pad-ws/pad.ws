import type { NonDeletedExcalidrawElement } from "@atyrode/excalidraw/element/types";
import type { AppState, Collaborator } from "@atyrode/excalidraw/types";

// Define types for collaboration events
export type CollabEventType = 'pointer_down' | 'pointer_up' | 'pointer_move' | 'elements_added' | 'elements_edited' | 'elements_deleted' | 'appstate_changed';

export interface EmitterInfo {
  userId: string;
  displayName: string;
  // We can add username or other fields later if needed
}

// Data for pointer events, especially pointer_move
export interface PointerData {
  x: number;
  y: number;
  tool: "pointer" | "laser"; // Align with Excalidraw's CollaboratorPointer type
  // pressure?: number; // Optional, if needed later
}

export interface CollabEvent {
  type: CollabEventType;
  timestamp: number;
  emitter?: EmitterInfo;
  pointer?: PointerData; // Updated to use PointerData
  button?: "down" | "up"; // Align with Excalidraw's expected button types
  selectedElementIds?: AppState["selectedElementIds"]; // For pointer_move, from Excalidraw's AppState
  elements?: NonDeletedExcalidrawElement[];
  appState?: Partial<AppState>;
  files?: any;
  changedElementIds?: string[];
}

// Re-export Collaborator for convenience if needed by other parts of the collab system
export type { Collaborator };
