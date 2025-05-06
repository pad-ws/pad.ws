import { DEFAULT_SETTINGS } from '../types/settings';
import type { ExcalidrawImperativeAPI } from "@atyrode/excalidraw/types";
import type { NonDeletedExcalidrawElement } from "@atyrode/excalidraw/element/types";
import type { AppState } from "@atyrode/excalidraw/types";
import { CanvasData, PadData } from '../api/hooks';
import { fetchApi } from '../api/apiUtils';
import { queryClient } from '../api/queryClient';

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
  
  // Merge existing pad properties with our updates
  appState.pad = { 
    ...existingPad,  // Preserve all existing properties (uniqueId, displayName, etc.)
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

// Local storage keys
export const LOCAL_STORAGE_PADS_KEY = 'pad_ws_pads';
export const LOCAL_STORAGE_ACTIVE_PAD_KEY = 'pad_ws_active_pad';
export const LOCAL_STORAGE_SCROLL_INDEX_KEY = 'pad_ws_scroll_index';

/**
 * Stores pad data in local storage
 * @param padId The ID of the pad to store
 * @param data The pad data to store
 */
export function storePadData(padId: string, data: any): void {
  try {
    // Get existing pads data from local storage
    const storedPadsString = localStorage.getItem(LOCAL_STORAGE_PADS_KEY);
    const storedPads = storedPadsString ? JSON.parse(storedPadsString) : {};
    
    // Update the pad data
    storedPads[padId] = data;
    
    // Save back to local storage
    localStorage.setItem(LOCAL_STORAGE_PADS_KEY, JSON.stringify(storedPads));
    
    console.debug(`[pad.ws] Stored pad ${padId} data in local storage`);
  } catch (error) {
    console.error('[pad.ws] Error storing pad data in local storage:', error);
  }
}

/**
 * Gets pad data from local storage
 * @param padId The ID of the pad to retrieve
 * @returns The pad data or null if not found
 */
export function getPadData(padId: string): any | null {
  try {
    // Get pads data from local storage
    const storedPadsString = localStorage.getItem(LOCAL_STORAGE_PADS_KEY);
    if (!storedPadsString) return null;
    
    const storedPads = JSON.parse(storedPadsString);
    
    // Return the pad data if it exists
    return storedPads[padId] || null;
  } catch (error) {
    console.error('[pad.ws] Error getting pad data from local storage:', error);
    return null;
  }
}

/**
 * Sets the active pad ID globally and stores it in local storage
 * @param padId The ID of the pad to set as active
 */
export function setActivePad(padId: string): void {
  (window as any).activePadId = padId;
  
  // Store the active pad ID in local storage
  try {
    localStorage.setItem(LOCAL_STORAGE_ACTIVE_PAD_KEY, padId);
    console.debug(`[pad.ws] Stored active pad ID ${padId} in local storage`);
  } catch (error) {
    console.error('[pad.ws] Error storing active pad ID in local storage:', error);
  }
  
  // Dispatch a custom event to notify components of the active pad change
  const event = new CustomEvent('activePadChanged', { detail: padId });
  window.dispatchEvent(event);
  
  console.debug(`[pad.ws] Set active pad to ${padId}`);
}

/**
 * Gets the current active pad ID from the global variable
 * @returns The active pad ID or null if not set
 */
export function getActivePad(): string | null {
  return (window as any).activePadId || null;
}

/**
 * Gets the stored active pad ID from local storage
 * @returns The stored active pad ID or null if not found
 */
export function getStoredActivePad(): string | null {
  try {
    const storedActivePadId = localStorage.getItem(LOCAL_STORAGE_ACTIVE_PAD_KEY);
    return storedActivePadId;
  } catch (error) {
    console.error('[pad.ws] Error getting active pad ID from local storage:', error);
    return null;
  }
}

/**
 * Sets the scroll index in local storage
 * @param index The scroll index to store
 */
export function setScrollIndex(index: number): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_SCROLL_INDEX_KEY, index.toString());
    console.debug(`[pad.ws] Stored scroll index ${index} in local storage`);
  } catch (error) {
    console.error('[pad.ws] Error storing scroll index in local storage:', error);
  }
}

/**
 * Gets the stored scroll index from local storage
 * @returns The stored scroll index or 0 if not found
 */
export function getStoredScrollIndex(): number {
  try {
    const storedScrollIndex = localStorage.getItem(LOCAL_STORAGE_SCROLL_INDEX_KEY);
    return storedScrollIndex ? parseInt(storedScrollIndex, 10) : 0;
  } catch (error) {
    console.error('[pad.ws] Error getting scroll index from local storage:', error);
    return 0;
  }
}

/**
 * Saves the current pad data before switching to another pad
 * @param excalidrawAPI The Excalidraw API instance
 * @param activePadId The current active pad ID
 * @param saveCanvas The saveCanvas mutation function
 */
export function saveCurrentPadBeforeSwitching(
  excalidrawAPI: ExcalidrawImperativeAPI,
  activePadId: string | null,
  saveCanvas: (data: CanvasData) => void
): void {
  if (!activePadId) return;
  
  // Get the current elements, state, and files
  const elements = excalidrawAPI.getSceneElements();
  const appState = excalidrawAPI.getAppState();
  const files = excalidrawAPI.getFiles();
  
  // Create the canvas data object
  const canvasData = {
    elements: [...elements] as any[], // Convert readonly array to mutable array
    appState,
    files
  };
  
  // Save the canvas data to local storage
  storePadData(activePadId, canvasData);
  
  // Save the canvas data to the server
  saveCanvas(canvasData);
  
  console.debug("[pad.ws] Saved canvas before switching");
}

/**
 * Loads pad data into the Excalidraw canvas
 * @param excalidrawAPI The Excalidraw API instance
 * @param padId The ID of the pad to load
 * @param serverData The server data to use as fallback
 */
export function loadPadData(
  excalidrawAPI: ExcalidrawImperativeAPI,
  padId: string,
  serverData: any
): void {
  // Try to get the pad data from local storage first
  const localPadData = getPadData(padId);
  
  if (localPadData) {
    // Use the local data if available
    console.debug(`[pad.ws] Loading pad ${padId} data from local storage`);
    excalidrawAPI.updateScene(normalizeCanvasData(localPadData));
  } else if (serverData) {
    // Fall back to the server data
    console.debug(`[pad.ws] No local data found for pad ${padId}, using server data`);
    excalidrawAPI.updateScene(normalizeCanvasData(serverData));
  }
}

/**
 * Creates a new pad from the default template
 * @param excalidrawAPI The Excalidraw API instance
 * @param activePadId The current active pad ID
 * @param saveCanvas The saveCanvas mutation function
 * @returns Promise resolving to the new pad data
 */
export async function createNewPad(
  excalidrawAPI: ExcalidrawImperativeAPI,
  activePadId: string | null,
  saveCanvas: (data: CanvasData) => void
): Promise<PadData> {
  // Save the current canvas before creating a new pad
  if (activePadId) {
    saveCurrentPadBeforeSwitching(excalidrawAPI, activePadId, saveCanvas);
  }
  
  // Create a new pad from the default template
  const newPad = await fetchApi('/api/pad/from-template/default', {
    method: 'POST',
    body: JSON.stringify({
      display_name: `New Pad ${new Date().toLocaleTimeString()}`,
    }),
  });
  
  // Manually update the pads list instead of refetching
  // Get the current pads from the query cache
  const currentPads = queryClient.getQueryData<PadData[]>(['allPads']) || [];
  
  // Add the new pad to the list
  queryClient.setQueryData(['allPads'], [...currentPads, newPad]);
  
  // Store the new pad data in local storage
  storePadData(newPad.id, newPad.data);
  
  // Update the canvas with the new pad's data
  // Normalize the data before updating the scene
  excalidrawAPI.updateScene(normalizeCanvasData(newPad.data));
  console.debug("[pad.ws] Loaded new pad data");
  
  // Set the active pad ID globally
  setActivePad(newPad.id);
  
  return newPad;
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
