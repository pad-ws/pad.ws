import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWorkspaceState } from '../../api/hooks';
import type { NonDeleted, ExcalidrawEmbeddableElement } from '@atyrode/excalidraw/element/types';
import type { AppState } from '@atyrode/excalidraw/types';
import './Terminal.scss';

interface TerminalProps {
  element: NonDeleted<ExcalidrawEmbeddableElement>;
  appState: AppState;
  excalidrawAPI?: any;
}

// Interface for terminal connection info stored in customData
interface TerminalConnectionInfo {
  terminalId: string;
  baseUrl?: string;
  username?: string;
  workspaceId?: string;
  agent?: string;
}

export const Terminal: React.FC<TerminalProps> = ({
  element,
  appState,
  excalidrawAPI
}) => {
  const { data: workspaceState } = useWorkspaceState();
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [shouldRenderIframe, setShouldRenderIframe] = useState(false);
  const elementIdRef = useRef(element?.id);
  const isInitializedRef = useRef(false);

  // Generate a UUID for terminal ID
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  // Save terminal connection info to element's customData
  const saveConnectionInfoToCustomData = useCallback(() => {
    if (!element || !excalidrawAPI || !workspaceState || !terminalId) return;
    
    try {
      // Get all elements from the scene
      const elements = excalidrawAPI.getSceneElements();
      
      // Find and update the element
      const updatedElements = elements.map(el => {
        if (el.id === element.id) {
          // Create a new customData object with the terminal connection info
          const connectionInfo: TerminalConnectionInfo = {
            terminalId,
            baseUrl: workspaceState.base_url,
            username: workspaceState.username,
            workspaceId: workspaceState.workspace_id,
            agent: workspaceState.agent
          };
          
          const customData = {
            ...(el.customData || {}),
            terminalConnectionInfo: connectionInfo
          };
          
          return { ...el, customData };
        }
        return el;
      });
      
      // Update the scene with the modified elements
      excalidrawAPI.updateScene({
        elements: updatedElements
      });
    } catch (error) {
      console.error('Error saving terminal connection info:', error);
    }
  }, [element, excalidrawAPI, workspaceState, terminalId]);

  // Generate a terminal ID if one doesn't exist
  useEffect(() => {
    if (terminalId) return;
    
    // Generate a new terminal ID
    const newTerminalId = generateUUID();
    setTerminalId(newTerminalId);
  }, [terminalId]);
  
  // Initialize terminal connection info
  useEffect(() => {
    if (!element || !workspaceState || !terminalId || isInitializedRef.current) return;
    
    // Check if element ID has changed (indicating a new element)
    if (element.id !== elementIdRef.current) {
      elementIdRef.current = element.id;
    }
    
    // Check if element already has terminal connection info
    if (element.customData?.terminalConnectionInfo) {
      const connectionInfo = element.customData.terminalConnectionInfo as TerminalConnectionInfo;
      setTerminalId(connectionInfo.terminalId);
    } else if (excalidrawAPI) {
      // Save the terminal ID to customData
      saveConnectionInfoToCustomData();
    }
    
    isInitializedRef.current = true;
  }, [element, workspaceState, terminalId, saveConnectionInfoToCustomData, excalidrawAPI]);

  // Update terminal connection info when element changes
  useEffect(() => {
    if (!element || !workspaceState) return;
    
    // Check if element ID has changed (indicating a new element)
    if (element.id !== elementIdRef.current) {
      elementIdRef.current = element.id;
      isInitializedRef.current = false;
      
      // Check if element already has terminal connection info
      if (element.customData?.terminalConnectionInfo) {
        const connectionInfo = element.customData.terminalConnectionInfo as TerminalConnectionInfo;
        setTerminalId(connectionInfo.terminalId);
      } else if (terminalId && excalidrawAPI) {
        // Save the existing terminal ID to customData
        saveConnectionInfoToCustomData();
      } else if (!terminalId) {
        // Generate a new terminal ID if one doesn't exist
        const newTerminalId = generateUUID();
        setTerminalId(newTerminalId);
        
        // Save the new terminal ID to customData if excalidrawAPI is available
        if (excalidrawAPI) {
          setTimeout(() => {
            saveConnectionInfoToCustomData();
          }, 100);
        }
      }
      
      isInitializedRef.current = true;
    } else if (!isInitializedRef.current && terminalId && excalidrawAPI && !element.customData?.terminalConnectionInfo) {
      // Handle the case where the element ID hasn't changed but we need to save the terminal ID
      saveConnectionInfoToCustomData();
      isInitializedRef.current = true;
    }
  }, [element, workspaceState, excalidrawAPI, terminalId, saveConnectionInfoToCustomData]);
  
  // Effect to handle excalidrawAPI becoming available after component mount
  useEffect(() => {
    if (!excalidrawAPI || !element || !workspaceState || !terminalId) return;
    
    // Check if element already has terminal connection info
    if (element.customData?.terminalConnectionInfo) return;
    
    // Save the terminal ID to customData
    saveConnectionInfoToCustomData();
  }, [excalidrawAPI, element, workspaceState, terminalId, saveConnectionInfoToCustomData]);

  const getTerminalUrl = () => {
    if (!workspaceState) {
      return '';
    }
    
    const baseUrl = `${workspaceState.base_url}/@${workspaceState.username}/${workspaceState.workspace_id}.${workspaceState.agent}/terminal`;
    
    // Add reconnect parameter if terminal ID exists
    if (terminalId) {
      return `${baseUrl}?reconnect=${terminalId}`;
    }
    
    return baseUrl;
  };

  const terminalUrl = getTerminalUrl();

  // Effect to delay loading the iframe
  useEffect(() => {
    // Set a small timeout to allow the scrolling to complete first
    const timer = setTimeout(() => {
      setShouldRenderIframe(true);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  // Handle iframe load event
  const handleIframeLoad = () => {
    setIframeLoaded(true);
    console.debug('[pad.ws] Terminal iframe loaded');
  };

  return (
    <div className="terminal-container">
      {shouldRenderIframe ? (
        <div className="terminal-iframe-wrapper">
          <iframe 
            className={`terminal-iframe ${iframeLoaded ? 'terminal-iframe--loaded' : 'terminal-iframe--loading-fade'}`}
            src={terminalUrl} 
            title="Terminal"
            onLoad={handleIframeLoad}
          />
          <div className={`terminal-loading-animation terminal-loading-animation--fade ${iframeLoaded ? 'terminal-loading-animation--hidden' : ''}`}>
            <img 
              src="/assets/images/favicon.png" 
              alt="pad.ws logo" 
              className="terminal-loading-logo" 
            />
          </div>
        </div>
      ) : (
        <div className="terminal-iframe terminal-iframe--loading">
          <div className="terminal-loading-animation">
            <img 
              src="/assets/images/favicon.png" 
              alt="pad.ws logo" 
              className="terminal-loading-logo" 
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Terminal;
