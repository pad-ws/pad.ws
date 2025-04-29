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
  Terminal,
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
        break;
      case 'editor':
        content = <Editor element={element} appState={appState} excalidrawAPI={excalidrawAPI} />;
        title = "Code Editor";
        break;
      case 'terminal':
        content = <Terminal element={element} appState={appState} excalidrawAPI={excalidrawAPI} />;
        title = "Terminal";
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
          <LockIndicator appState={appState} />
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
          <LockIndicator appState={appState} />
        </div>
        <div className="custom-embed__content">
          <iframe className="custom-embed__content--iframe" src={element.link} />
        </div>
      </div>
    );
  }
};

// Lock icon component that shows when scrolling or when hand tool is active
const LockIndicator = ({ appState }: { appState?: AppState }) => {
  const [isScrolling, setIsScrolling] = useState(false);
  const [isHandToolActive, setIsHandToolActive] = useState(false);
  
  // Effect to handle scroll state changes
  useEffect(() => {
    const handleScrollStateChange = (event: CustomEvent<{ isScrolling: boolean }>) => {
      setIsScrolling(event.detail.isScrolling);
    };
    
    // Add event listener for scroll state changes
    document.addEventListener('scrollStateChange', handleScrollStateChange as EventListener);
    
    // Clean up
    return () => {
      document.removeEventListener('scrollStateChange', handleScrollStateChange as EventListener);
    };
  }, []);
  
  // Separate effect to handle hand tool state changes
  useEffect(() => {
    // Check hand tool state
    const handToolActive = appState?.activeTool?.type === "hand";
    const wasHandToolActive = isHandToolActive;
    setIsHandToolActive(handToolActive);
    
    // If hand tool was active but is now deactivated
    if (wasHandToolActive && !handToolActive) {
      // Force reset of global scrolling state
      globalIsScrolling = false;
      document.documentElement.style.setProperty('--embeddable-pointer-events', 'all');
      
      // Dispatch event to update all components
      scrollStateChangeEvent.detail.isScrolling = false;
      document.dispatchEvent(scrollStateChangeEvent);
      
      // Update component state
      setIsScrolling(false);
    } else if (handToolActive) {
      // Set pointer-events to none when hand tool is active
      document.documentElement.style.setProperty('--embeddable-pointer-events', 'none');
    }
  }, [appState]);
  
  // Determine if the lock should be visible
  const visible = isScrolling || isHandToolActive;
  
  return (
    <div className={`custom-embed__lock-icon ${visible ? 'visible' : ''}`}>
      <Lock size={16} />
      <span className={`custom-embed__lock-icon__text ${isHandToolActive ? 'visible' : ''}`}>
        (Hand tool)
      </span>
    </div>
  );
};

// Track scrolling state globally
let globalIsScrolling = false;
// Create a custom event for scrolling state changes
const scrollStateChangeEvent = new CustomEvent('scrollStateChange', { detail: { isScrolling: false } });

// Memoized debounced function factory
const getDebouncedScrollEnd = (() => {
  let lastDebounceTime = 0;
  let debouncedFn: ReturnType<typeof debounce> | null = null;
  
  return (currentDebounceTime: number) => {
    // Only recreate if the time has changed
    if (currentDebounceTime !== lastDebounceTime || !debouncedFn) {
      lastDebounceTime = currentDebounceTime;
      debouncedFn = debounce(() => {
        globalIsScrolling = false;
        // Set pointer-events back to all when not scrolling
        document.documentElement.style.setProperty('--embeddable-pointer-events', 'all');
        // Dispatch event with updated scrolling state
        scrollStateChangeEvent.detail.isScrolling = false;
        document.dispatchEvent(scrollStateChangeEvent);
      }, currentDebounceTime);
    }
    return debouncedFn;
  };
})();

export const lockEmbeddables = (appState?: AppState) => {
  // Get the debounce time from settings, with fallback to default
  const debounceTime = appState?.pad?.userSettings?.embedLockDebounceTime || 350;
  
  // Check if hand tool is active
  const handToolActive = appState?.activeTool?.type === "hand";
  
  if (!globalIsScrolling) {
    globalIsScrolling = true;
    // Set pointer-events to none during scrolling or when hand tool is active
    document.documentElement.style.setProperty('--embeddable-pointer-events', 'none');
    // Dispatch event with updated scrolling state
    scrollStateChangeEvent.detail.isScrolling = true;
    document.dispatchEvent(scrollStateChangeEvent);
  }
  
  // If hand tool is not active, use debounce to unlock after scrolling stops
  // If hand tool is active, we don't want to unlock
  if (!handToolActive) {
    // Get the current debounced function and call it
    const debouncedScrollEnd = getDebouncedScrollEnd(debounceTime);
    debouncedScrollEnd();
  }
};
