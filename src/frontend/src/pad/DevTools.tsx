import React, { useState, useEffect, useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { MousePointer, Edit, Clock, Move, Settings, Plus, Trash2, Radio, Send } from 'lucide-react';
import './DevTools.scss';
import { CollabEvent, CollabEventType } from '../lib/collab';
import { useUserProfile } from '../api/hooks';

interface DevToolsProps {
  element?: any; // Excalidraw element
  appState?: any; // Excalidraw app state
  excalidrawAPI?: any; // Excalidraw API instance
}

// Enum for DevTools tabs
type DevToolsTab = 'receive' | 'emit';

interface CollabLogData {
  id: string;
  timestamp: string;
  type: CollabEventType;
  data: CollabEvent;
}

const DevTools: React.FC<DevToolsProps> = ({ element, appState, excalidrawAPI }) => {
  // Active tab state (receive or emit)
  const [activeTab, setActiveTab] = useState<DevToolsTab>('receive');

  // Get user profile to determine own user ID
  const { data: userProfile } = useUserProfile();
  const currentUserId = userProfile?.id;

  // Store collaboration events
  const [sendingLogs, setSendingLogs] = useState<CollabLogData[]>([]);
  const [receivedLogs, setReceivedLogs] = useState<CollabLogData[]>([]);
  // Current collab log to display
  const [selectedLog, setSelectedLog] = useState<CollabLogData | null>(null);
  // Store the latest pointer move event separately
  const [latestPointerMove, setLatestPointerMove] = useState<CollabLogData | null>(null);
  
  // Emit tab state
  const [selectedEventType, setSelectedEventType] = useState<CollabEventType>('pointer_down');
  const [emitEventData, setEmitEventData] = useState<string>('{\n  "type": "pointer_down",\n  "timestamp": 0,\n  "pointer": {\n    "x": 100,\n    "y": 100\n  },\n  "button": "left"\n}');

  // Subscribe to collaboration events
  useEffect(() => {
    const handleCollabEvent = (event: CustomEvent) => {
      const collabEvent: CollabEvent = event.detail;

      const newCollabLog: CollabLogData = {
        id: `collab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(collabEvent.timestamp).toISOString(),
        type: collabEvent.type,
        data: collabEvent,
      };

      if (collabEvent.type === 'pointer_move') {
        setLatestPointerMove(newCollabLog);
        if (selectedLog?.type === 'pointer_move') {
          setSelectedLog(newCollabLog);
        }
      } else {
        const eventEmitterId = collabEvent.emitter?.userId;
        if (currentUserId && eventEmitterId === currentUserId) {
          setSendingLogs(prevLogs => [newCollabLog, ...prevLogs].slice(0, 50)); // Keep last 50 sent
        } else {
          setReceivedLogs(prevLogs => [newCollabLog, ...prevLogs].slice(0, 50)); // Keep last 50 received
        }
        // Auto-select the newest log (consider which list to pick from or if this is still desired)
        setSelectedLog(newCollabLog);
      }
    };

    document.addEventListener('collabEvent', handleCollabEvent as EventListener);
    return () => {
      document.removeEventListener('collabEvent', handleCollabEvent as EventListener);
    };
  }, [selectedLog, currentUserId]);

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
          emitter: log.data.emitter,
          pointer: log.data.pointer,
          button: log.data.button
        }, null, 2);
      
      case 'elements_added':
        return JSON.stringify({
          type: log.type,
          timestamp: new Date(log.data.timestamp).toLocaleString(),
          emitter: log.data.emitter,
          addedElements: log.data.elements,
          count: log.data.elements?.length || 0
        }, null, 2);
      
      case 'elements_edited':
        return JSON.stringify({
          type: log.type,
          timestamp: new Date(log.data.timestamp).toLocaleString(),
          emitter: log.data.emitter,
          editedElements: log.data.elements,
          count: log.data.elements?.length || 0
        }, null, 2);
      
      case 'elements_deleted':
        return JSON.stringify({
          type: log.type,
          timestamp: new Date(log.data.timestamp).toLocaleString(),
          emitter: log.data.emitter,
          deletedElements: log.data.elements,
          count: log.data.elements?.length || 0
        }, null, 2);
      
      case 'appstate_changed':
        return JSON.stringify({
          type: log.type,
          timestamp: new Date(log.data.timestamp).toLocaleString(),
          emitter: log.data.emitter,
          appState: log.data.appState
        }, null, 2);
      
      default:
        // For pointer_move and any other types, include emitter if present
        return JSON.stringify({
          ...log.data,
          timestamp: new Date(log.data.timestamp).toLocaleString(), // Ensure timestamp is formatted
        }, null, 2);
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
      case 'elements_added':
        return <Plus size={14} />;
      case 'elements_edited':
        return <Edit size={14} />;
      case 'elements_deleted':
        return <Trash2 size={14} />;
      case 'appstate_changed':
        return <Settings size={14} />;
      default:
        return <Clock size={14} />;
    }
  };

  // Function to emit a custom event
  const handleEmitEvent = () => {
    try {
      // Parse the event data from the editor
      const eventData = JSON.parse(emitEventData);
      
      // Ensure the event has a timestamp
      if (!eventData.timestamp) {
        eventData.timestamp = Date.now();
      }
      
      // Ensure the event has the correct type
      eventData.type = selectedEventType;
      
      // Dispatch the event
      const collabEvent = new CustomEvent('collabEvent', {
        detail: eventData
      });
      document.dispatchEvent(collabEvent);
      
      // Show success message
      console.log('[DevTools] Emitted event:', eventData);
    } catch (error) {
      console.error('[DevTools] Error emitting event:', error);
      alert(`Error emitting event: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  // Function to generate template event data based on selected type
  const generateTemplateEventData = (type: CollabEventType): string => {
    const timestamp = Date.now();
    
    switch (type) {
      case 'pointer_down':
      case 'pointer_up':
        return JSON.stringify({
          type,
          timestamp,
          emitter: { userId: "test" },
          pointer: { x: 100, y: 100 },
          button: 'left'
        }, null, 2);
      
      case 'pointer_move':
        return JSON.stringify({
          type,
          timestamp,
          emitter: { userId: "test" },
          pointer: { x: 100, y: 100 }
        }, null, 2);
      
      case 'elements_added':
        return JSON.stringify({
          type,
          timestamp,
          emitter: { userId: "test" },
          elements: [{
            id: 'element-1',
            type: 'rectangle',
            x: 100,
            y: 100,
            width: 100,
            height: 100,
            version: 1
          }]
        }, null, 2);
      
      case 'elements_edited':
        return JSON.stringify({
          type,
          timestamp,
          emitter: { userId: "test" },
          elements: [{
            id: 'element-1',
            type: 'rectangle',
            x: 150,
            y: 150,
            width: 100,
            height: 100,
            version: 2
          }]
        }, null, 2);
      
      case 'elements_deleted':
        return JSON.stringify({
          type,
          timestamp,
          emitter: { userId: "test" },
          elements: [{
            id: 'element-1'
          }]
        }, null, 2);
      
      case 'appstate_changed':
        return JSON.stringify({
          type,
          timestamp,
          emitter: { userId: "test" },
          appState: {
            viewBackgroundColor: '#ffffff'
          }
        }, null, 2);
      
      default:
        return JSON.stringify({
          type,
          timestamp,
          emitter: { userId: "test" }
        }, null, 2);
    }
  };
  
  // Update event data template when event type changes
  useEffect(() => {
    setEmitEventData(generateTemplateEventData(selectedEventType));
  }, [selectedEventType]);

  // Effect to refresh emitEventData when Emit tab is selected
  useEffect(() => {
    if (activeTab === 'emit') {
      setEmitEventData(generateTemplateEventData(selectedEventType));
    }
    // Note: We don't need to do anything special for the 'receive' tab here,
    // as its content is driven by `selectedLog` which updates independently.
  }, [activeTab, selectedEventType]); // Re-run if activeTab or selectedEventType changes

  return (
    <div className="dev-tools">
      <div className="dev-tools__header">
        <h2>Collaboration Events</h2>
        <div className="dev-tools__tabs">
          <button 
            className={`dev-tools__tab ${activeTab === 'receive' ? 'active' : ''}`}
            onClick={() => setActiveTab('receive')}
          >
            <Radio size={14} />
            <span>Receive</span>
          </button>
          <button 
            className={`dev-tools__tab ${activeTab === 'emit' ? 'active' : ''}`}
            onClick={() => setActiveTab('emit')}
          >
            <Send size={14} />
            <span>Emit</span>
          </button>
        </div>
      </div>
      
      {/* Pointer Move Tracker - Always visible at the top when in receive mode */}
      {activeTab === 'receive' && latestPointerMove && (
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
        {activeTab === 'receive' ? (
          <div className="dev-tools__collab-container">
            <div className="dev-tools__collab-events-wrapper">
              {/* Sending Events List */}
              <div className="dev-tools__collab-events">
                <div className="dev-tools__collab-events-header">
                  Sending Events
                </div>
                <div className="dev-tools__collab-events-list">
                  {sendingLogs.map((log) => (
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
                  {sendingLogs.length === 0 && (
                    <div className="dev-tools__collab-empty">
                      No sending events yet.
                    </div>
                  )}
                </div>
              </div>

              {/* Received Events List */}
              <div className="dev-tools__collab-events">
                <div className="dev-tools__collab-events-header">
                  Received Events
                </div>
                <div className="dev-tools__collab-events-list">
                  {receivedLogs.map((log) => (
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
                  {receivedLogs.length === 0 && (
                    <div className="dev-tools__collab-empty">
                      No received events yet.
                    </div>
                  )}
                </div>
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
        ) : (
          <div className="dev-tools__emit-container">
            <div className="dev-tools__emit-controls">
              <div className="dev-tools__emit-header">
                <h3>Emit Custom Event</h3>
                <p>Create and emit custom collaboration events to test your application.</p>
              </div>
              
              <div className="dev-tools__emit-form">
                <div className="dev-tools__emit-field">
                  <label htmlFor="event-type">Event Type:</label>
                  <select 
                    id="event-type" 
                    value={selectedEventType}
                    onChange={(e) => setSelectedEventType(e.target.value as CollabEventType)}
                  >
                    <option value="pointer_down">pointer_down</option>
                    <option value="pointer_up">pointer_up</option>
                    <option value="pointer_move">pointer_move</option>
                    <option value="elements_added">elements_added</option>
                    <option value="elements_edited">elements_edited</option>
                    <option value="elements_deleted">elements_deleted</option>
                    <option value="appstate_changed">appstate_changed</option>
                  </select>
                </div>
                
                <button 
                  className="dev-tools__emit-button"
                  onClick={handleEmitEvent}
                >
                  <Send size={14} />
                  <span>Emit Event</span>
                </button>
              </div>
            </div>
            
            <div className="dev-tools__emit-editor">
              <div className="dev-tools__editor-header">Event Data (JSON)</div>
              <MonacoEditor
                height="100%"
                language="json"
                theme="vs-dark"
                value={emitEventData}
                onChange={(value) => setEmitEventData(value || '')}
                options={{
                  readOnly: false, // Explicitly set to false
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 12,
                  automaticLayout: true,
                  wordWrap: 'on'
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DevTools;
