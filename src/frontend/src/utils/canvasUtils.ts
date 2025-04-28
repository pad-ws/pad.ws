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
