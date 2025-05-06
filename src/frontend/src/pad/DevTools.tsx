import React, { useState, useEffect, useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { MousePointer, Edit, Clock, Move } from 'lucide-react';
import './DevTools.scss';
import { CollabEvent, CollabEventType } from '../lib/room';

interface DevToolsProps {
  element?: any; // Excalidraw element
  appState?: any; // Excalidraw app state
  excalidrawAPI?: any; // Excalidraw API instance
}

interface CollabLogData {
  id: string;
  timestamp: string;
  type: CollabEventType;
  data: CollabEvent;
}

const DevTools: React.FC<DevToolsProps> = ({ element, appState, excalidrawAPI }) => {
  // Store collaboration events
  const [collabLogs, setCollabLogs] = useState<CollabLogData[]>([]);
  // Current collab log to display
  const [selectedLog, setSelectedLog] = useState<CollabLogData | null>(null);
  // Store the latest pointer move event separately
  const [latestPointerMove, setLatestPointerMove] = useState<CollabLogData | null>(null);

  // Subscribe to collaboration events
  useEffect(() => {
    // Create a custom event listener for collaboration events
    const handleCollabEvent = (event: CustomEvent) => {
      const collabEvent: CollabEvent = event.detail;
      
      // Create a new collab log entry
      const newCollabLog: CollabLogData = {
        id: `collab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(collabEvent.timestamp).toISOString(),
        type: collabEvent.type,
        data: collabEvent
      };
      
      // Handle pointer_move events differently to avoid spamming the UI
      if (collabEvent.type === 'pointer_move') {
        // Just update the latest pointer move state
        setLatestPointerMove(newCollabLog);
        
        // If the currently selected log is a pointer_move, update to show the latest
        if (selectedLog?.type === 'pointer_move') {
          setSelectedLog(newCollabLog);
        }
      } else {
        // For other event types, add to the logs list
        setCollabLogs(prevLogs => {
          const newLogs = [newCollabLog, ...prevLogs].slice(0, 100);
          return newLogs;
        });
        
        // Auto-select the newest log
        setSelectedLog(newCollabLog);
      }
    };

    // Register the custom event
    document.addEventListener('collabEvent', handleCollabEvent as EventListener);

    // Clean up
    return () => {
      document.removeEventListener('collabEvent', handleCollabEvent as EventListener);
    };
  }, [selectedLog]);

  // Format collaboration event data as pretty JSON
  const formatCollabEventData = (log: CollabLogData | null) => {
    if (!log) return "{}";
    
    // Format based on event type
    switch (log.type) {
      case 'pointer_down':
      case 'pointer_up':
        return JSON.stringify({
          type: log.type,
          timestamp: new Date(log.data.timestamp).toLocaleString(),
          pointer: log.data.pointer,
          button: log.data.button
        }, null, 2);
      
      case 'elements_changed':
        return JSON.stringify({
          type: log.type,
          timestamp: new Date(log.data.timestamp).toLocaleString(),
          changedElementIds: log.data.changedElementIds,
          totalElements: log.data.elements?.length || 0
        }, null, 2);
      
      default:
        return JSON.stringify(log.data, null, 2);
    }
  };

  // Get icon for collaboration event type
  const getCollabEventIcon = (type: CollabEventType) => {
    switch (type) {
      case 'pointer_down':
      case 'pointer_up':
        return <MousePointer size={14} />;
      case 'pointer_move':
        return <Move size={14} />;
      case 'elements_changed':
        return <Edit size={14} />;
      default:
        return <Clock size={14} />;
    }
  };

  return (
    <div className="dev-tools">
      <div className="dev-tools__header">
        <h2>Collaboration Events</h2>
      </div>
      
      {/* Pointer Move Tracker - Always visible at the top */}
      {latestPointerMove && (
        <div className="dev-tools__pointer-tracker">
          <div className="dev-tools__pointer-tracker-header">
            <div className="dev-tools__pointer-tracker-icon">
              <Move size={14} />
            </div>
          <div className="dev-tools__pointer-tracker-title">
            Pointer Position (Canvas Coordinates)
            <span className="dev-tools__collab-event-live-indicator"></span>
          </div>
          </div>
          <div className="dev-tools__pointer-tracker-coords">
            <span>X: {latestPointerMove.data.pointer?.x.toFixed(2) || 0}</span>
            <span>Y: {latestPointerMove.data.pointer?.y.toFixed(2) || 0}</span>
            <span className="dev-tools__pointer-tracker-time">
              {new Date(latestPointerMove.timestamp).toLocaleTimeString()}
            </span>
          </div>
        </div>
      )}
      
      <div className="dev-tools__content">
        <div className="dev-tools__collab-container">
          <div className="dev-tools__collab-events">
            <div className="dev-tools__collab-events-header">
              Recent Events
            </div>
            <div className="dev-tools__collab-events-list">
              {/* Don't show pointer_move events in the regular list */}
              
              {/* Show all other events */}
              {collabLogs.map((log) => (
                <div 
                  key={log.id}
                  className={`dev-tools__collab-event-item ${selectedLog?.id === log.id ? 'active' : ''}`}
                  onClick={() => setSelectedLog(log)}
                >
                  <div className="dev-tools__collab-event-icon">
                    {getCollabEventIcon(log.type)}
                  </div>
                  <div className="dev-tools__collab-event-info">
                    <div className="dev-tools__collab-event-type">
                      {log.type}
                    </div>
                    <div className="dev-tools__collab-event-time">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
              {collabLogs.length === 0 && (
                <div className="dev-tools__collab-empty">
                  No events yet. Interact with the canvas to generate events.
                </div>
              )}
            </div>
          </div>
          <div className="dev-tools__collab-details">
            <div className="dev-tools__editor-header">Event Details</div>
            <MonacoEditor
              height="100%"
              language="json"
              theme="vs-dark"
              value={formatCollabEventData(selectedLog)}
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
        </div>
      </div>
    </div>
  );
};

export default DevTools;
