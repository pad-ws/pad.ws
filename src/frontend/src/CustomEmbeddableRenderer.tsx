import React from 'react';
import type { NonDeleted, ExcalidrawEmbeddableElement } from '@atyrode/excalidraw/element/types';
import type { AppState } from '@atyrode/excalidraw/types';
import {
  Dashboard,
  StateIndicator,
  ControlButton,
  HtmlEditor,
  Editor
} from './pad';
import { ActionButton } from './pad/buttons';

export const renderCustomEmbeddable = (
  element: NonDeleted<ExcalidrawEmbeddableElement>,
  appState: AppState,
  excalidrawAPI?: any
) => {

  if (element.link && element.link.startsWith('!')) {
    let path = element.link.split('!')[1];

    switch (path) {
      case 'html':
        return <HtmlEditor element={element} appState={appState} excalidrawAPI={excalidrawAPI} />;
      case 'editor':
        return <Editor element={element} appState={appState} excalidrawAPI={excalidrawAPI} />;
      case 'state':
        return <StateIndicator />;
      case 'control':
        return <ControlButton />;
      case 'button':
        return <ActionButton
          target="code"
          element={element}
          excalidrawAPI={excalidrawAPI}
          settingsEnabled={true}
        />;
      case 'dashboard':
        return <Dashboard element={element} appState={appState} excalidrawAPI={excalidrawAPI} />;
      default:
        return null;
    }
  } else {
    return <iframe className="custom-rendered-embeddable" src={element.link} />;
  }
};
