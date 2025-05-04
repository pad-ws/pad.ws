import { DEFAULT_SETTINGS } from '../types/settings';
import type { ExcalidrawImperativeAPI } from "@atyrode/excalidraw/types";
import { CanvasData } from '../api/hooks';

/**
 * 
 * @param data The canvas data to normalize
 * @returns Normalized canvas data
 */
export function normalizeCanvasData(data: any) {
  if (!data) return data;
  
  const appState = { ...data.appState };
  
  // Remove width and height properties
  if ("width" in appState) {
    delete appState.width;
  }
  if ("height" in appState) {
    delete appState.height;
  }

  // Preserve existing pad settings if they exist, otherwise create new ones
  const existingPad = appState.pad || {};
  const existingUserSettings = existingPad.userSettings || {};
  
  // Merge existing user settings with default settings
  appState.pad = { 
    moduleBorderOffset: {
      left: 10,
      right: 10,
      top: 40,
      bottom: 10,
    },
    // Merge existing user settings with default settings
    userSettings: {
      ...DEFAULT_SETTINGS,
      ...existingUserSettings
    }
  };
  
  // Reset collaborators (https://github.com/excalidraw/excalidraw/issues/8637)
  appState.collaborators = new Map();
  
  return { ...data, appState };
}

/**
 * Saves the current canvas state using the Excalidraw API
 * @param saveCanvas The saveCanvas mutation function from useSaveCanvas hook
 * @param onSuccess Optional callback to run after successful save
 * @param onError Optional callback to run if save fails
 */
export function saveCurrentCanvas(
  saveCanvas: (data: CanvasData) => void,
  onSuccess?: () => void,
  onError?: (error: any) => void
) {
  try {
    // Get the excalidrawAPI from the window object
    const excalidrawAPI = (window as any).excalidrawAPI as ExcalidrawImperativeAPI | null;
    
    if (excalidrawAPI) {
      // Get the current elements, state, and files
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();
      
      // Save the canvas data
      saveCanvas({
        elements: [...elements] as any[], // Convert readonly array to mutable array
        appState,
        files
      });
      
      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess();
      }
      
      return true;
    } else {
      console.warn("[pad.ws] ExcalidrawAPI not available");
      
      // Call onError callback if provided
      if (onError) {
        onError(new Error("ExcalidrawAPI not available"));
      }
      
      return false;
    }
  } catch (error) {
    console.error("[pad.ws] Error saving canvas:", error);
    
    // Call onError callback if provided
    if (onError) {
      onError(error);
    }
    
    return false;
  }
}
