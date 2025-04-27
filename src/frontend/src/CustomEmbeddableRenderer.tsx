import React from 'react';
import type { NonDeleted, ExcalidrawEmbeddableElement } from '@atyrode/excalidraw/element/types';
import type { AppState } from '@atyrode/excalidraw/types';
import {
  Dashboard,
  StateIndicator,
  ControlButton,
  HtmlEditor,
  Editor,
} from './pad';
import { ActionButton } from './pad/buttons';
import "./CustomEmbeddableRenderer.scss";

export const renderCustomEmbeddable = (
  element: NonDeleted<ExcalidrawEmbeddableElement>,
  appState: AppState,
  excalidrawAPI?: any
) => {

  if (element.link && element.link.startsWith('!')) {
    let path = element.link.split('!')[1];
    let content;

    switch (path) {
      case 'html':
        content = <HtmlEditor element={element} appState={appState} excalidrawAPI={excalidrawAPI} />;
        break;
      case 'editor':
        content = <Editor element={element} appState={appState} excalidrawAPI={excalidrawAPI} />;
        break;
      case 'state':
        content = <StateIndicator />;
        break;
      case 'control':
        content = <ControlButton />;
        break;
      case 'button':
        content = <ActionButton
          target="code"
          element={element}
          excalidrawAPI={excalidrawAPI}
          settingsEnabled={true}
        />;
        break;
      case 'dashboard':
        content = <Dashboard element={element} appState={appState} excalidrawAPI={excalidrawAPI} />;
        break;
      default:
        return null;
    }
    
    return <div className="custom-rendered-embeddable">{content}</div>;
  } else {
    return <iframe className="custom-rendered-embeddable" src={element.link} />;
  }
};
