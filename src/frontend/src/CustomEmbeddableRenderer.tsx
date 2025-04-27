import React from 'react';
import { debounce } from './utils/debounce';
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
    let title;

    switch (path) {
      case 'html':
        content = <HtmlEditor element={element} appState={appState} excalidrawAPI={excalidrawAPI} />;
        title = "HTML Editor";
      case 'editor':
        content = <Editor element={element} appState={appState} excalidrawAPI={excalidrawAPI} />;
        title = "Code Editor";
        break;
      case 'state':
        content = <StateIndicator />;
        title = "State Indicator";
        break;
      case 'control':
        content = <ControlButton />;
        title = "Control Button";
        break;
      case 'button':
        content = <ActionButton
          target="code"
          element={element}
          excalidrawAPI={excalidrawAPI}
          settingsEnabled={true}
        />;
        title = "Action Button";
        break;
      case 'dashboard':
        content = <Dashboard element={element} appState={appState} excalidrawAPI={excalidrawAPI} />;
        title = "Dashboard";
        break;
      default:
        title = "Untitled";
        return null;
    }

    if (element.customData?.title) {
      title = element.customData.title;
    }
    
    return (
      <div className="custom-embed">
        <div className="custom-embed__title-bar">
          <div className="custom-embed__title-bar__text">{title}</div>
        </div>
        <div className="custom-embed__content">
          {content}
        </div>
      </div>
    );
  } else {
    const title = element.customData?.title || element.link || "Untitled";

    return (
      <div className="custom-embed">
        <div className="custom-embed__title-bar">
          <div className="custom-embed__title-bar__text">{title}</div>
        </div>
        <div className="custom-embed__content">
          <iframe className="custom-embed__content--iframe" src={element.link} />
        </div>
      </div>
    );
  }
};

// Track scrolling state
let isScrolling = false;

export const lockEmbeddables = (appState: AppState) => {
  if (!isScrolling) {
    isScrolling = true;
    // Set pointer-events to none during scrolling
    document.documentElement.style.setProperty('--embeddable-pointer-events', 'none');
  }
  
  // Reset the pointer-events after scrolling stops
  debouncedScrollEnd();
};

// Create a debounced function to detect when scrolling ends
const debouncedScrollEnd = debounce(() => {
  isScrolling = false;
  // Set pointer-events back to all when not scrolling
  document.documentElement.style.setProperty('--embeddable-pointer-events', 'all');
}, 150); // 150ms debounce seems reasonable, but can be adjusted as needed
