import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
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
          <LockIndicator />
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
          <LockIndicator />
        </div>
        <div className="custom-embed__content">
          <iframe className="custom-embed__content--iframe" src={element.link} />
        </div>
      </div>
    );
  }
};

// Lock icon component that shows when scrolling
const LockIndicator = () => {
  const [visible, setVisible] = useState(false);
  
  useEffect(() => {
    const handleScrollStateChange = (event: CustomEvent<{ isScrolling: boolean }>) => {
      setVisible(event.detail.isScrolling);
    };
    
    // Add event listener for scroll state changes
    document.addEventListener('scrollStateChange', handleScrollStateChange as EventListener);
    
    // Clean up
    return () => {
      document.removeEventListener('scrollStateChange', handleScrollStateChange as EventListener);
    };
  }, []);
  
  return (
    <div className={`custom-embed__lock-icon ${visible ? 'visible' : ''}`}>
      <Lock size={16} />
    </div>
  );
};

// Track scrolling state
let isScrolling = false;
// Create a custom event for scrolling state changes
const scrollStateChangeEvent = new CustomEvent('scrollStateChange', { detail: { isScrolling: false } });

export const lockEmbeddables = () => {
  if (!isScrolling) {
    isScrolling = true;
    // Set pointer-events to none during scrolling
    document.documentElement.style.setProperty('--embeddable-pointer-events', 'none');
    // Dispatch event with updated scrolling state
    scrollStateChangeEvent.detail.isScrolling = true;
    document.dispatchEvent(scrollStateChangeEvent);
  }
  
  // Reset the pointer-events after scrolling stops
  debouncedScrollEnd();
};

// Create a debounced function to detect when scrolling ends
const debouncedScrollEnd = debounce(() => {
  isScrolling = false;
  // Set pointer-events back to all when not scrolling
  document.documentElement.style.setProperty('--embeddable-pointer-events', 'all');
  // Dispatch event with updated scrolling state
  scrollStateChangeEvent.detail.isScrolling = false;
  document.dispatchEvent(scrollStateChangeEvent);
}, 500); // 500ms debounce seems reasonable, but can be adjusted as needed
