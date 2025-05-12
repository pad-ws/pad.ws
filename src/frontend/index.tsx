import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import posthog from "./src/utils/posthog";
import { PostHogProvider } from 'posthog-js/react';

import "@atyrode/excalidraw/index.css";
import "./index.scss";

import App from "./src/App";
import AuthGate from "./src/AuthGate";


async function initApp() {
  const rootElement = document.getElementById("root")!;
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
        <PostHogProvider client={posthog}>
            <AuthGate />
            <App />
        </PostHogProvider>
    </StrictMode>,
  );
}

initApp().catch(console.error);
