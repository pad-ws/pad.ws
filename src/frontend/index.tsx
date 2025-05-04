import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import posthog from "./src/utils/posthog";
import { PostHogProvider } from 'posthog-js/react';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from './src/api/queryClient';

import "@atyrode/excalidraw/index.css";
import "./index.scss";

import type * as TExcalidraw from "@atyrode/excalidraw";

import App from "./src/App";
import AuthGate from "./src/AuthGate";
import { BuildVersionCheck } from "./src/BuildVersionCheck";


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
        <PostHogProvider client={posthog}>
          <QueryClientProvider client={queryClient}>
            <BuildVersionCheck />
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
    </StrictMode>,
  );
}

initApp().catch(console.error);
