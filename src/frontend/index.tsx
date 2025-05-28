import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import "@atyrode/excalidraw/index.css";
import "./index.scss";

import App from "./src/App";
import AuthGate from "./src/AuthGate";

const queryClient = new QueryClient();

async function initApp() {
  const rootElement = document.getElementById("root")!;
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
          <AuthGate />
          <App />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </StrictMode>,
  );
}

initApp().catch(console.error);
