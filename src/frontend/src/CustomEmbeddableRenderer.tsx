import React from 'react';
import type { NonDeleted, ExcalidrawEmbeddableElement } from '@excalidraw/excalidraw/element/types';
import type { AppState } from '@excalidraw/excalidraw/types';
import {
  Dashboard,
  StateIndicator,
  ControlButton,
  HtmlEditor
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
      case 'editor':
        return <HtmlEditor element={element} appState={appState} excalidrawAPI={excalidrawAPI} />;
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
  }

  return null;
};
