# Collaboration System Architecture

This document describes the real-time collaboration system architecture implemented in Pad.ws. The collaboration system enables tracking and broadcasting user interactions with the canvas, which can be used to implement real-time collaborative features.

## 1. Overview

The collaboration system is designed to:

- Track user interactions with the Excalidraw canvas
- Detect and broadcast changes to canvas elements
- Provide a standardized event format for all collaboration events
- Enable real-time synchronization between clients

The system uses a custom event-based architecture to capture and broadcast user actions, which can then be processed by the backend or other clients to maintain a synchronized state.

## 2. Collaboration Event Types

The system defines four primary types of collaboration events:

| Event Type | Description | Payload |
|------------|-------------|---------|
| `pointer_down` | User pressed a pointer (mouse/touch) on the canvas | Pointer coordinates, button type |
| `pointer_up` | User released a pointer on the canvas | Pointer coordinates, button type |
| `pointer_move` | User moved a pointer over the canvas | Pointer coordinates |
| `elements_changed` | Canvas elements were modified | Modified elements, app state, changed element IDs |

All events include a timestamp and event-specific data.

## 3. Event Structure

Each collaboration event follows a standardized structure:

```typescript
interface CollabEvent {
  type: 'pointer_down' | 'pointer_up' | 'pointer_move' | 'elements_changed';
  timestamp: number;
  pointer?: { x: number; y: number }; // Canvas-relative coordinates
  button?: string;
  elements?: NonDeletedExcalidrawElement[];
  appState?: Partial<AppState>;
  files?: any;
  changedElementIds?: string[];
}
```

This structure ensures consistency across all event types and provides all necessary information for synchronizing state between clients.

## 4. Tracking User Interactions

### 4.1 Pointer Events

The system tracks three types of pointer events:

1. **Pointer Down**: Triggered when a user presses a mouse button or touches the screen
2. **Pointer Up**: Triggered when a user releases a mouse button or lifts their finger
3. **Pointer Move**: Triggered when a user moves the pointer over the canvas

These events are captured using Excalidraw's API hooks and DOM event listeners:

```typescript
// Subscribe to pointer events
const unsubPointerDown = excalidrawAPI.onPointerDown(handlePointerDown);
const unsubPointerUp = excalidrawAPI.onPointerUp(handlePointerUp);
canvas.addEventListener("pointermove", handlePointerMove);
```

Pointer move events are throttled to prevent overwhelming the system with too many events:

```typescript
const handlePointerMove = throttle((event: PointerEvent) => {
  // Process and dispatch event
}, POINTER_MOVE_THROTTLE_MS);
```

### 4.2 Element Changes

Element changes are tracked by:

1. Detecting which elements have changed since the last update
2. Creating an `elements_changed` event with the modified elements
3. Dispatching the event to notify listeners

The system uses a reference to the previous state to detect changes:

```typescript
const detectChangedElements = (
  elements: NonDeletedExcalidrawElement[],
  previousElementsRef: { current: { [id: string]: NonDeletedExcalidrawElement } }
): string[] => {
  // Compare current elements with previous state
  // Return array of changed element IDs
};
```

## 5. Coordinate System

All pointer coordinates are converted from window/viewport coordinates to canvas/scene coordinates:

```typescript
const convertToSceneCoords = (
  clientX: number,
  clientY: number,
  appState: AppState
) => {
  return viewportCoordsToSceneCoords(
    { clientX, clientY },
    appState
  );
};
```

This ensures that coordinates are consistent regardless of canvas zoom level, pan position, or viewport size.

## 6. Event Dispatching

Events are dispatched using the browser's CustomEvent API:

```typescript
export const dispatchCollabEvent = (event: CollabEvent): void => {
  const collabEvent = new CustomEvent('collabEvent', {
    detail: event
  });
  document.dispatchEvent(collabEvent);
};
```

This allows any component in the application to listen for and react to collaboration events.

## 7. Canvas Change Detection

Canvas changes are detected and dispatched in a debounced callback:

```typescript
const debouncedLogChange = useCallback(
  debounce(
    (elements, state, files) => {
      // Detect changes and dispatch events
    },
    1200 // Debounce time in milliseconds
  ),
  [dependencies]
);
```

The debouncing ensures that events are not dispatched too frequently, which could impact performance.

## 8. Implementation Flow

1. **Initialization**:
   - When the Excalidraw API is available, set up collaboration event handlers
   - Initialize references to track element changes

2. **User Interaction**:
   - User interacts with the canvas (pointer events, drawing, etc.)
   - Event handlers capture these interactions

3. **Event Processing**:
   - Convert coordinates to canvas space
   - Format event data according to the CollabEvent interface
   - For element changes, detect which elements have changed

4. **Event Dispatching**:
   - Dispatch the formatted event using CustomEvent
   - Throttle or debounce events as needed to prevent overwhelming the system

5. **Event Consumption**:
   - Backend or other clients can listen for these events
   - Process events to maintain synchronized state

## 9. Integration with Backend

The collaboration events can be sent to a backend server to:

- Persist changes to the database
- Broadcast changes to other connected clients
- Implement conflict resolution strategies
- Track user activity and session information

The backend can receive these events through WebSockets, HTTP requests, or other communication channels.

## 10. Future Enhancements

Potential enhancements to the collaboration system include:

- Implementing operational transformation or CRDT for conflict resolution
- Adding user presence indicators
- Supporting selective synchronization of specific elements
- Implementing undo/redo functionality across clients
- Adding support for offline mode with synchronization on reconnect

## 11. Summary

The collaboration system provides a robust foundation for implementing real-time collaborative features in Pad.ws. By capturing and standardizing user interactions and element changes, it enables synchronized experiences across multiple clients.
