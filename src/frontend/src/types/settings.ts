/**
 * Types for user settings
 */

export interface UserSettings {
  /**
   * The debounce time in milliseconds for the embed lock
   * Range: 150ms to 5000ms (5 seconds)
   * Default: 350ms
   */
  embedLockDebounceTime?: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  embedLockDebounceTime: 350, // Default value from CustomEmbeddableRenderer.tsx
};
