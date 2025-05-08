import type { RemoteCursor } from "./types";

// Module-scoped variable to store remote cursors
// Key: userId, Value: RemoteCursor
const remoteCursors = new Map<string, RemoteCursor>();

/**
 * Dispatches an event indicating that the remote cursors have been updated.
 * The UI can listen to this event to re-render cursors.
 */
const dispatchRemoteCursorsUpdatedEvent = () => {
  const event = new CustomEvent('remoteCursorsUpdated', {
    detail: new Map(remoteCursors) // Send a copy
  });
  document.dispatchEvent(event);
};

/**
 * Updates or adds a remote cursor and dispatches an update event.
 * @param cursorData The data for the remote cursor.
 */
export const updateRemoteCursor = (cursorData: RemoteCursor): void => {
  remoteCursors.set(cursorData.userId, cursorData);
  dispatchRemoteCursorsUpdatedEvent();
};

/**
 * Removes a remote cursor and dispatches an update event.
 * @param userId The ID of the user whose cursor to remove.
 */
export const removeRemoteCursor = (userId: string): void => {
  if (remoteCursors.has(userId)) {
    remoteCursors.delete(userId);
    dispatchRemoteCursorsUpdatedEvent();
  }
};

/**
 * Gets a snapshot of the current remote cursors.
 * @returns A map of remote cursors.
 */
export const getRemoteCursors = (): Map<string, RemoteCursor> => {
  return new Map(remoteCursors); // Return a copy
};
