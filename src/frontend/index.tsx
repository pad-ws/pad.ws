import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// import posthog from "./src/lib/posthog";
// import { PostHogProvider } from 'posthog-js/react';

import "@atyrode/excalidraw/index.css";
import "./index.scss";

import App from "./src/App";
import AuthGate from "./src/AuthGate";


// Create a client
const queryClient = new QueryClient();

async function initApp() {
  const rootElement = document.getElementById("root")!;
  const root = createRoot(rootElement);
  root.render(
    // <StrictMode>
      <QueryClientProvider client={queryClient}>
        {/* <PostHogProvider client={posthog}> */}
            <AuthGate />
            <App />
        {/* </PostHogProvider> */}
      </QueryClientProvider>
    // </StrictMode>,
  );
}

initApp().catch(console.error);
