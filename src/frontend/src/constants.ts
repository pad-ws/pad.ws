import { UserSettings } from "./ui/types";

// Default app values
export const INITIAL_APP_DATA = {
    appState: {
        theme: "dark",
        gridModeEnabled: true,
        gridSize: 20,
        gridStep: 5,
    },
    elements: [],
    files: [],
};

// UI elements
export const HIDDEN_UI_ELEMENTS = {
    toolbar: false,
    zoomControls: false,
    undoRedo: false,
    helpButton: false,
    mainMenu: false,
    sidebar: true,
};

// Collab constants
export const POINTER_MOVE_THROTTLE_MS = 30; // Throttle pointer move events to reduce the number of updates sent to the server
export const ENABLE_PERIODIC_FULL_SYNC = false; // Set to false to disable periodic scene_update full sync
export const PERIODIC_FULL_SYNC_INTERVAL_MS = 60000; // Sync scene_update every 60 seconds if ENABLE_PERIODIC_FULL_SYNC is true

// Pad constants
export const DEFAULT_SETTINGS: UserSettings = {
    embedLockDebounceTime: 350,
  };