import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PostHogProvider } from 'posthog-js/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from './src/api/queryClient';

import "@excalidraw/excalidraw/index.css";
import "./src/styles/index.scss";

import type * as TExcalidraw from "@excalidraw/excalidraw";

import App from "./src/App";
import { AuthProvider } from "./src/auth/AuthContext";
import AuthGate from "./src/AuthGate";
import ErrorBoundary from "./src/ErrorBoundary";

// PostHog is automatically initialized in ./utils/posthog.ts
import "./src/utils/posthog";

declare global {
  interface Window {
    ExcalidrawLib: typeof TExcalidraw;
  }
}

async function initApp() {
  const rootElement = document.getElementById("root")!;
  const root = createRoot(rootElement);
  const { Excalidraw } = window.ExcalidrawLib;
  root.render(
    <StrictMode>

      <ErrorBoundary>
        <PostHogProvider
          apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
          options={{
            api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
          }}
        >

          <QueryClientProvider client={queryClient}>
            <AuthGate>
              <App
                useCustom={(api: any, args?: any[]) => { }}
                excalidrawLib={window.ExcalidrawLib}
              >
                <Excalidraw />
              </App>
            </AuthGate>
            <ReactQueryDevtools initialIsOpen={false} />
          </QueryClientProvider>
        </PostHogProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

initApp().catch(console.error);
