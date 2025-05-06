import React, { useState, useEffect, useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { RefreshCw, ChevronRight, ChevronLeft } from 'lucide-react';
import './DevTools.scss';

interface DevToolsProps {
  element?: any; // Excalidraw element
  appState?: any; // Excalidraw app state
  excalidrawAPI?: any; // Excalidraw API instance
}

interface LogData {
  timestamp: string;
  data: {
    elements?: any[];
    appState?: any;
    files?: any;
  };
}

const DevTools: React.FC<DevToolsProps> = ({ element, appState, excalidrawAPI }) => {
  // Store all logs in a ref to avoid re-renders
  const logsRef = useRef<LogData[]>([]);
  // Current log index for navigation
  const [currentLogIndex, setCurrentLogIndex] = useState<number>(0);
  // Current log to display
  const [currentLog, setCurrentLog] = useState<LogData | null>(null);
  // Last refresh timestamp
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  // Flag to track if there's new data since last refresh
  const [hasNewData, setHasNewData] = useState<boolean>(false);
  // Editor ref
  const editorRef = useRef<any>(null);
  // Latest data ref
  const latestDataRef = useRef<any>(null);
  // Latest data hash for comparison
  const latestDataHashRef = useRef<string>("");
  
  // Function to format the elements data as pretty JSON
  const formatElementsData = (log: LogData | null) => {
    if (!log || !log.data || !log.data.elements) return "{}";
    return JSON.stringify(log.data.elements, null, 2);
  };

  // Function to format the appState data as pretty JSON
  const formatAppStateData = (log: LogData | null) => {
    if (!log || !log.data || !log.data.appState) return "{}";
    return JSON.stringify(log.data.appState, null, 2);
  };

  // Subscribe to the debounced log changes but only store the latest data
  useEffect(() => {
    // Create a custom event listener for log changes
    const handleLogChange = (event: CustomEvent) => {
      const { elements, appState, files } = event.detail;
      
      // Store the latest data in the ref
      const newData = {
        elements,
        appState,
        files
      };
      
      // Create a hash of the data to compare with previous data
      const newDataHash = JSON.stringify(newData);
      
      // Only set hasNewData flag if the data has changed
      if (newDataHash !== latestDataHashRef.current) {
        latestDataRef.current = newData;
        latestDataHashRef.current = newDataHash;
        setHasNewData(true);
      }
    };

    // Create and register the custom event
    document.addEventListener('debouncedLogChange', handleLogChange as EventListener);

    // Clean up
    return () => {
      document.removeEventListener('debouncedLogChange', handleLogChange as EventListener);
    };
  }, []);

  // Handle editor mounting
  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  // Handle refresh button click
  const handleRefresh = () => {
    if (latestDataRef.current && hasNewData) {
      const currentTime = new Date().toISOString();
      
      // Create new log entry
      const newLog: LogData = {
        timestamp: currentTime,
        data: latestDataRef.current
      };
      
      // Add to logs array
      logsRef.current = [newLog, ...logsRef.current];
      
      // Set current log to the new log (index 0)
      setCurrentLogIndex(0);
      setCurrentLog(newLog);
      
      // Update last refresh time
      setLastRefresh(currentTime);
      
      // Reset new data flag
      setHasNewData(false);
    }
  };

  // Navigate to previous log (older)
  const handlePrevLog = () => {
    if (currentLogIndex > 0) {
      const newIndex = currentLogIndex - 1;
      setCurrentLogIndex(newIndex);
      setCurrentLog(logsRef.current[newIndex]);
    }
  };

  // Navigate to next log (newer)
  const handleNextLog = () => {
    if (currentLogIndex < logsRef.current.length - 1) {
      const newIndex = currentLogIndex + 1;
      setCurrentLogIndex(newIndex);
      setCurrentLog(logsRef.current[newIndex]);
    }
  };

  return (
    <div className="dev-tools">
      <div className="dev-tools__header">
        <h2>Development Tools</h2>
        <div className="dev-tools__controls">
          <button 
            className={`dev-tools__refresh-button ${!hasNewData ? 'disabled' : ''}`} 
            onClick={handleRefresh}
            title="Refresh data"
            disabled={!hasNewData}
          >
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>
          
          <div className="dev-tools__navigation">
            <button 
              className={`dev-tools__nav-button ${currentLogIndex <= 0 ? 'disabled' : ''}`}
              onClick={handlePrevLog}
              disabled={currentLogIndex <= 0}
              title="Previous log (older)"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="dev-tools__log-counter">
              {logsRef.current.length > 0 
                ? `${currentLogIndex + 1} / ${logsRef.current.length}` 
                : '0 / 0'}
            </span>
            <button 
              className={`dev-tools__nav-button ${currentLogIndex >= logsRef.current.length - 1 ? 'disabled' : ''}`}
              onClick={handleNextLog}
              disabled={currentLogIndex >= logsRef.current.length - 1}
              title="Next log (newer)"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          
          <div className="dev-tools__stats">
            <span>Last refresh: {lastRefresh ? new Date(lastRefresh).toLocaleTimeString() : 'Never'}</span>
            {hasNewData && <span className="dev-tools__new-data-indicator">New data available</span>}
          </div>
        </div>
      </div>
      <div className="dev-tools__content">
        <div className="dev-tools__editors">
          <div className="dev-tools__editor-container">
            <div className="dev-tools__editor-header">Elements</div>
            <MonacoEditor
              height="100%"
              language="json"
              theme="vs-dark"
              value={formatElementsData(currentLog)}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 12,
                automaticLayout: true,
                wordWrap: 'on'
              }}
            />
          </div>
          <div className="dev-tools__editor-container">
            <div className="dev-tools__editor-header">App State</div>
            <MonacoEditor
              height="100%"
              language="json"
              theme="vs-dark"
              value={formatAppStateData(currentLog)}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 12,
                automaticLayout: true,
                wordWrap: 'on'
              }}
              onMount={handleEditorDidMount}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DevTools;
