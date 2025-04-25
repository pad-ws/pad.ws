import React, { Children, cloneElement, useState, useEffect } from 'react';
import DiscordButton from './ui/DiscordButton';
import FeedbackButton from './ui/FeedbackButton';
import type { ExcalidrawImperativeAPI } from '@atyrode/excalidraw/types';
import type { NonDeletedExcalidrawElement } from '@atyrode/excalidraw/element/types';
import type { AppState } from '@atyrode/excalidraw/types';
import { MainMenuConfig } from './ui/MainMenu';
import { renderCustomEmbeddable } from './CustomEmbeddableRenderer';
import AuthDialog from './ui/AuthDialog';

const defaultInitialData = {
  elements: [],
  appState: {
    gridModeEnabled: true,
    gridSize: 20,
    gridStep: 5,
  },
  files: {},
};

interface ExcalidrawWrapperProps {
  children: React.ReactNode;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  setExcalidrawAPI: (api: ExcalidrawImperativeAPI) => void;
  initialData?: any;
  onChange: (elements: NonDeletedExcalidrawElement[], state: AppState) => void;
  MainMenu: any;
  renderTopRightUI?: () => React.ReactNode;
  isAuthenticated?: boolean | null;
  isAuthLoading?: boolean;
}

export const ExcalidrawWrapper: React.FC<ExcalidrawWrapperProps> = ({
  children,
  excalidrawAPI,
  setExcalidrawAPI,
  initialData,
  onChange,
  MainMenu,
  renderTopRightUI,
  isAuthenticated = null,
  isAuthLoading = false,
}) => {
  // Add state for modal animation
  const [isExiting, setIsExiting] = useState(false);
  
  // Handle auth state changes
  useEffect(() => {
    if (isAuthenticated === true) {
      setIsExiting(true);
    }
  }, [isAuthenticated]);
  
  const renderExcalidraw = (children: React.ReactNode) => {
    const Excalidraw = Children.toArray(children).find(
      (child: any) =>
        React.isValidElement(child) &&
        typeof child.type !== "string" &&
        child.type.displayName === "Excalidraw",
    );

    if (!Excalidraw) {
      return null;
    }

    return cloneElement(
      Excalidraw as React.ReactElement,
      {
        excalidrawAPI: (api: ExcalidrawImperativeAPI) => setExcalidrawAPI(api),
        theme: "dark",
        initialData: initialData ?? defaultInitialData,
        onChange: onChange,
        name: "Pad.ws",
        validateEmbeddable: true,
        renderEmbeddable: (element, appState) => renderCustomEmbeddable(element, appState, excalidrawAPI),
        renderTopRightUI: renderTopRightUI ?? (() => (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <FeedbackButton />
            <DiscordButton />
          </div>
        )),
      },
      <>
        <MainMenuConfig MainMenu={MainMenu} excalidrawAPI={excalidrawAPI} />
        {!isAuthLoading && isAuthenticated === false && (
          <AuthDialog 
            onClose={() => {}}
          />
        )}
      </>
    );
  };

  return (
    <div className="excalidraw-wrapper">
      {renderExcalidraw(children)}
    </div>
  );
};
