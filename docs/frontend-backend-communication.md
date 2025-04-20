# Frontend-Backend Communication (React Query Architecture)

This document describes the current architecture and all communication points between the frontend and backend in the Pad.ws application, following the React Query refactor. All API interactions are now managed through React Query hooks, providing deduplication, caching, polling, and robust error handling.

---

## 1. Overview of Communication Architecture

- **All frontend-backend communication is handled via React Query hooks.**
- **API calls are centralized in `src/frontend/src/api/hooks.ts` and `apiUtils.ts`.**
- **No custom context providers for authentication or workspace state are used; hooks are called directly in components.**
- **Error and loading states are managed by React Query.**
- **Mutations (e.g., saving data, starting/stopping workspace) automatically invalidate relevant queries.**

---

## 2. Authentication

### 2.1. Authentication Status

- **Hook:** `useAuthCheck`
- **Endpoint:** `GET /api/workspace/state`
- **Usage:** Determines if the user is authenticated. Returns `true` if authenticated, `false` if 401 Unauthorized.
- **Example:**
  ```typescript
  import { useAuthCheck } from "./api/hooks";
  const { data: isAuthenticated = true } = useAuthCheck();
  ```
- **UI:** If `isAuthenticated` is `false`, the login modal (`AuthModal`) is displayed.

### 2.2. Login/Logout

- **Login:** Handled via OAuth redirects (e.g., `/auth/login?kc_idp_hint=google`).
- **Logout:** Handled via redirect to `/auth/logout`.
- **No direct API call from React Query; handled by browser navigation.**

---

## 3. User Profile

- **Hook:** `useUserProfile`
- **Endpoint:** `GET /api/user/me`
- **Usage:** Fetches the authenticated user's profile.
- **Example:**
  ```typescript
  import { useUserProfile } from "./api/hooks";
  const { data: userProfile, isLoading, error } = useUserProfile();
  ```

---

## 4. Workspace Management

### 4.1. Workspace State

- **Hook:** `useWorkspaceState`
- **Endpoint:** `GET /api/workspace/state`
- **Usage:** Polls workspace state every 5 seconds.
- **Example:**
  ```typescript
  import { useWorkspaceState } from "./api/hooks";
  const { data: workspaceState, isLoading, error } = useWorkspaceState();
  ```

### 4.2. Start/Stop Workspace

- **Hooks:** `useStartWorkspace`, `useStopWorkspace`
- **Endpoints:** `POST /api/workspace/start`, `POST /api/workspace/stop`
- **Usage:** Mutations to start/stop the workspace. On success, invalidate and refetch workspace state.
- **Example:**
  ```typescript
  import { useStartWorkspace, useStopWorkspace } from "./api/hooks";
  const { mutate: startWorkspace } = useStartWorkspace();
  const { mutate: stopWorkspace } = useStopWorkspace();
  // Usage: startWorkspace(); stopWorkspace();
  ```

---

## 5. Canvas Data Management

### 5.1. Load Canvas

- **Hooks:** `useCanvas`, `useDefaultCanvas`
- **Endpoints:** `GET /api/canvas`, `GET /api/canvas/default`
- **Usage:** Loads user canvas data; falls back to default if not available or on error.
- **Example:**
  ```typescript
  import { useCanvas, useDefaultCanvas } from "./api/hooks";
  const { data: canvasData, isError } = useCanvas();
  const { data: defaultCanvasData } = useDefaultCanvas({ enabled: isError });
  ```

### 5.2. Save Canvas

- **Hook:** `useSaveCanvas`
- **Endpoint:** `POST /api/canvas`
- **Usage:** Saves canvas data. Only called if user is authenticated.
- **Example:**
  ```typescript
  import { useSaveCanvas } from "./api/hooks";
  const { mutate: saveCanvas } = useSaveCanvas();
  // Usage: saveCanvas(canvasData);
  ```

---

## 6. Error Handling

- **All API errors are handled by React Query and the `fetchApi` utility.**
- **401 Unauthorized:** Triggers unauthenticated state; login modal is shown.
- **Other errors:** Exposed via `error` property in hook results; components can display error messages or fallback UI.
- **Example:**
  ```typescript
  const { data, error, isLoading } = useWorkspaceState();
  if (error) { /* Show error UI */ }
  ```

---

## 7. API Utility Functions

- **File:** `src/frontend/src/api/apiUtils.ts`
- **Functions:** `fetchApi`, `handleResponse`
- **Purpose:** Centralizes fetch logic, error handling, and credentials management for all API calls.

---

## 8. Summary

- **All frontend-backend communication is now declarative and managed by React Query hooks.**
- **No legacy context classes or direct fetches remain.**
- **API logic is centralized, maintainable, and testable.**
- **Error handling, caching, and polling are handled automatically.**
- **UI components react to hook state for loading, error, and data.**

This architecture ensures robust, efficient, and maintainable communication between the frontend and backend.
