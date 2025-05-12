import React, { useState, useEffect } from "react";
import { ExcalidrawWrapper } from "./ExcalidrawWrapper";
import type * as TExcalidraw from "@atyrode/excalidraw";
import type { ExcalidrawImperativeAPI } from "@atyrode/excalidraw/types";

export interface AppProps {
  useCustom: (api: ExcalidrawImperativeAPI | null, customArgs?: any[]) => void;
  customArgs?: any[];
  children?: React.ReactNode;
  excalidrawLib: typeof TExcalidraw;
}

export default function App({
  useCustom,
  customArgs,
  children,
  excalidrawLib,
}: AppProps) {
  const { useHandleLibrary, MainMenu } = excalidrawLib;

  const isAuthenticated = false; //TODO

  // Excalidraw API ref
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  useCustom(excalidrawAPI, customArgs);
  useHandleLibrary({ excalidrawAPI });

  useEffect(() => {
    if (excalidrawAPI) {
      (window as any).excalidrawAPI = excalidrawAPI;
    }
    return () => {
      (window as any).excalidrawAPI = null;
    };
  }, [excalidrawAPI]);

  /* PostHog user identification */
  // useEffect(() => {
  //   if (userProfile?.id) {
  //     posthog.identify(userProfile.id);
  //     if (posthog.people && typeof posthog.people.set === "function") {
  //       const {
  //         id, // do not include in properties
  //         ...personProps
  //       } = userProfile;
  //       posthog.people.set(personProps);
  //     }
  //   }
  // }, [userProfile]);

  return (
    <>
      <ExcalidrawWrapper
        excalidrawAPI={excalidrawAPI}
        setExcalidrawAPI={setExcalidrawAPI}
        MainMenu={MainMenu}
        isAuthenticated={isAuthenticated}
      >
        {children}
      </ExcalidrawWrapper>

    </>
  );
}
