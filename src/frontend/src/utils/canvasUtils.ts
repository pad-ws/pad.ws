/**
 * Normalizes canvas data by removing width and height properties from appState
 * and resetting collaborators to an empty Map.
 * 
 * This is necessary when loading canvas data to ensure it fits properly in the current viewport
 * and doesn't carry over collaborator information that might be stale.
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

  appState.pad = { 
    moduleBorderOffset: {
      left: 10,
      right: 10,
      top: 40,
      bottom: 10,
    },
  };
  
  // Reset collaborators (https://github.com/excalidraw/excalidraw/issues/8637)
  appState.collaborators = new Map();
  
  return { ...data, appState };
}
