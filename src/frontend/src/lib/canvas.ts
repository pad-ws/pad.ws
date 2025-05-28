import { DEFAULT_SETTINGS } from '../types/settings';

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
    // Merge existing user settings with default settings
    userSettings: {
      ...DEFAULT_SETTINGS,
      ...existingUserSettings
    }
  };
  
  // Reset collaborators (https://github.com/excalidraw/excalidraw/issues/8637)
  appState.collaborators = new Map();
  
  // Support new appState key default value (https://github.com/excalidraw/excalidraw/commit/a30e1b25c60a9c5c6f049daada0443df874a5266#diff-b7eb4d88c1bc5b4756a01281478e2105db6502e96c2a4b855496c508cef05397L124-R124)
  appState.searchMatches = null;

  return { ...data, appState };
}