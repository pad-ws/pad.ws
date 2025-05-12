import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import posthog from "./src/utils/posthog";
import { PostHogProvider } from 'posthog-js/react';

import "@atyrode/excalidraw/index.css";
import "./index.scss";

import type * as TExcalidraw from "@atyrode/excalidraw";

import App from "./src/App";
import AuthGate from "./src/AuthGate";

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
            <AuthGate />
              <App
                useCustom={(api: any, args?: any[]) => { }}
                excalidrawLib={window.ExcalidrawLib}
              >
                <Excalidraw />
              </App>
        </PostHogProvider>
    </StrictMode>,
  );
}

initApp().catch(console.error);
