import React, { useState, useEffect, useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { MousePointer, Edit, Clock, Move, Settings, Plus, Trash2, Radio, Send, RefreshCw, Save } from 'lucide-react';
import './DevTools.scss';
import { CollabEvent, CollabEventType } from '../lib/collab';
import { useAuthStatus } from '../hooks/useAuthStatus';

interface DevToolsProps {
  element?: any; // Excalidraw element
  appState?: any; // Excalidraw app state
  excalidrawAPI?: any; // Excalidraw API instance
}

// Enum for DevTools sections and tabs
type DevToolsSection = 'collab' | 'appstate' | 'testing';
type DevToolsTab = 'receive' | 'emit';

interface CollabLogData {
  id: string;
  timestamp: string;
  type: CollabEventType;
  data: CollabEvent;
}

const DevTools: React.FC<DevToolsProps> = ({ element, appState, excalidrawAPI }) => {
  // Active section and tab states
  const [activeSection, setActiveSection] = useState<DevToolsSection>('collab');
  const [activeTab, setActiveTab] = useState<DevToolsTab>('receive');
  
  // AppState editor state
  const [currentAppState, setCurrentAppState] = useState<string>('{}');
  const [isAppStateLoading, setIsAppStateLoading] = useState<boolean>(false);

  // Get user profile to determine own user ID
  const { data: userProfile } = useAuthStatus();
  const currentUserId = userProfile?.id;

  // Store collaboration events
  const [sendingLogs, setSendingLogs] = useState<CollabLogData[]>([]);
  const [receivedLogs, setReceivedLogs] = useState<CollabLogData[]>([]);
  // Current collab log to display
  const [selectedLog, setSelectedLog] = useState<CollabLogData | null>(null);
  
  // Emit tab state
  const [selectedEventType, setSelectedEventType] = useState<CollabEventType>('pointer_down');
  const [emitEventData, setEmitEventData] = useState<string>('{\n  "type": "pointer_down",\n  "timestamp": 0,\n  "pointer": {\n    "x": 100,\n    "y": 100\n  },\n  "button": "left"\n}');
  
  // Testing section state
  const [collaboratorCount, setCollaboratorCount] = useState<number>(0);
  const [roomId, setRoomId] = useState<string>("test-room");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [ws, setWs] = useState<WebSocket | null>(null);


  // Subscribe to all collaboration events for logging and local cursor updates
  useEffect(() => {
    const handleCollabEvent = (event: CustomEvent) => {
      const collabEvent: CollabEvent = event.detail;

      // For all other event types, log them
      const newCollabLog: CollabLogData = {
        id: `collab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(collabEvent.timestamp).toISOString(),
        type: collabEvent.type,
        data: collabEvent,
      };

      const eventEmitterId = collabEvent.emitter?.userId;
      if (currentUserId && eventEmitterId === currentUserId) {
        setSendingLogs(prevLogs => [newCollabLog, ...prevLogs].slice(0, 50)); // Keep last 50 sent
      } else {
        setReceivedLogs(prevLogs => [newCollabLog, ...prevLogs].slice(0, 50)); // Keep last 50 received
      }
      // Auto-select the newest log for display in the JSON viewer
      setSelectedLog(newCollabLog);
    };

    document.addEventListener('collabEvent', handleCollabEvent as EventListener);
    return () => {
      document.removeEventListener('collabEvent', handleCollabEvent as EventListener);
    };
  }, [currentUserId]); // Dependencies: currentUserId. State setters are stable.

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

  // Function to refresh the AppState
  const refreshAppState = () => {
    if (!excalidrawAPI) return;
    
    setIsAppStateLoading(true);
    try {
      const currentState = excalidrawAPI.getAppState();
      setCurrentAppState(JSON.stringify(currentState, null, 2));
    } catch (error) {
      console.error('[DevTools] Error fetching AppState:', error);
    } finally {
      setIsAppStateLoading(false);
    }
  };
  
  // Function to update the AppState
  const updateAppState = () => {
    if (!excalidrawAPI) return;
    
    try {
      const newAppState = JSON.parse(currentAppState);
      
      // Fix collaborators issue (similar to the fix in canvas.ts)
      // Check if collaborators is an empty object ({}) or undefined
      const isEmptyObject = newAppState.collaborators && 
                           Object.keys(newAppState.collaborators).length === 0 && 
                           Object.getPrototypeOf(newAppState.collaborators) === Object.prototype;
                           
      if (!newAppState.collaborators || isEmptyObject) {
        // Apply the fix only if collaborators is empty or undefined
        newAppState.collaborators = new Map();
      }
      
      excalidrawAPI.updateScene({ appState: newAppState });
      console.log('[DevTools] AppState updated successfully');
    } catch (error) {
      console.error('[DevTools] Error updating AppState:', error);
      alert(`Error updating AppState: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  // Initialize AppState when component mounts or section changes to appstate
  useEffect(() => {
    if (activeSection === 'appstate' && excalidrawAPI) {
      refreshAppState();
    }
  }, [activeSection, excalidrawAPI]);
  
  // WebSocket connection functions
  const handleConnect = () => {
    if (!roomId.trim()) {
      alert("Please enter a Room ID.");
      return;
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log("Already connected.");
      return;
    }

    // Ensure userId is set
    if (!currentUserId) {
      console.error("User ID not set, cannot connect.");
      alert("User ID not available. Please ensure you are logged in and try again.");
      return;
    }
    
    // Set emitter info for outgoing events
    if (userProfile) {
      // Import from lib/collab if needed
      // setRoomEmitterInfo(currentUserId, userProfile.given_name, userProfile.username);
    }

    const wsUrl = `wss://alex.pad.ws/ws/collab/${roomId.trim()}`;
    console.log(`Attempting to connect to WebSocket: ${wsUrl} with userId: ${currentUserId}`);
    
    const newWs = new WebSocket(wsUrl);
    setWs(newWs);

    newWs.onopen = () => {
      console.log(`Connected to room: ${roomId}`);
      setIsConnected(true);
    };

    newWs.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);

        // Dispatch as a custom event for room.ts to handle
        if (message.emitter?.userId !== currentUserId) { // Basic check to avoid self-echo
          const collabEvent = new CustomEvent('collabEvent', { detail: message });
          document.dispatchEvent(collabEvent);
        }
      } catch (error) {
        console.error("Failed to parse incoming message or dispatch event:", error);
      }
    };

    newWs.onerror = (error) => {
      console.error("WebSocket error:", error);
      alert(`WebSocket error. Check console.`);
      setIsConnected(false);
    };

    newWs.onclose = (event) => {
      console.log(`Disconnected from room: ${roomId}. Code: ${event.code}, Reason: ${event.reason}`);
      setIsConnected(false);
      setWs(null);
    };
  };

  const handleDisconnect = () => {
    if (ws) {
      ws.close();
      setWs(null);
    }
    setIsConnected(false);
  };

  // Listen to 'collabEvent' from room.ts and send it via WebSocket
  useEffect(() => {
    const handleSendMessage = (event: Event) => {
      if (event instanceof CustomEvent && event.detail && isConnected && ws && ws.readyState === WebSocket.OPEN && currentUserId) {
        // Only send if this client is the emitter
        if (event.detail.emitter?.userId === currentUserId) {
          const messageWithEmitter = {
            ...event.detail,
            emitter: event.detail.emitter || { userId: currentUserId }
          };
          ws.send(JSON.stringify(messageWithEmitter));
        }
      }
    };
    
    document.addEventListener('collabEvent', handleSendMessage);
    return () => {
      document.removeEventListener('collabEvent', handleSendMessage);
    };
  }, [isConnected, currentUserId, ws]);

  // Function to create a random collaborator in the appstate
  const createRandomCollaborator = () => {
    if (!excalidrawAPI) {
      alert('Excalidraw API not available');
      return;
    }
    
    try {
      // Get current appState
      const currentState = excalidrawAPI.getAppState();
      
      // Ensure collaborators is a Map
      if (!currentState.collaborators || !(currentState.collaborators instanceof Map)) {
        currentState.collaborators = new Map();
      }
      
      // Generate a random ID for the collaborator
      const randomId = `test-collab-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // Create a random position for the collaborator
      const randomX = Math.floor(Math.random() * 1000);
      const randomY = Math.floor(Math.random() * 1000);
      
      // Create the collaborator object
      const newCollaborator = {
        userId: randomId,
        displayName: `Test User ${collaboratorCount + 1}`,
        x: randomX,
        y: randomY,
        isCurrentUser: false,
        pointer: { x: randomX, y: randomY },
        button: 'up',
        selectedElementIds: {},
        username: `testuser${collaboratorCount + 1}`,
        userState: 'active'
      };
      
      // Add the collaborator to the map
      currentState.collaborators.set(randomId, newCollaborator);
      
      // Update the scene with the new appState
      excalidrawAPI.updateScene({ appState: currentState });
      
      // Increment the collaborator count
      setCollaboratorCount(prev => prev + 1);
      
      console.log('[DevTools] Created random collaborator:', newCollaborator);
    } catch (error) {
      console.error('[DevTools] Error creating collaborator:', error);
      alert(`Error creating collaborator: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="dev-tools">
      <div className="dev-tools__header">
        <div className="dev-tools__sections">
          <button 
            className={`dev-tools__section ${activeSection === 'collab' ? 'active' : ''}`}
            onClick={() => setActiveSection('collab')}
          >
            <Radio size={16} />
            <span>Collaboration Events</span>
          </button>
          <button 
            className={`dev-tools__section ${activeSection === 'appstate' ? 'active' : ''}`}
            onClick={() => setActiveSection('appstate')}
          >
            <Settings size={16} />
            <span>AppState Editor</span>
          </button>
          <button 
            className={`dev-tools__section ${activeSection === 'testing' ? 'active' : ''}`}
            onClick={() => setActiveSection('testing')}
          >
            <RefreshCw size={16} />
            <span>Testing Tools</span>
          </button>
        </div>
        
        {activeSection === 'collab' && (
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
        )}
      </div>
      
      {/* AppState Editor */}
      {activeSection === 'appstate' && (
        <div className="dev-tools__appstate-container">
          <div className="dev-tools__appstate-controls">
            <div className="dev-tools__appstate-header">
              <h3>AppState Editor</h3>
              <p>View and modify the current Excalidraw AppState.</p>
            </div>
            
            <div className="dev-tools__appstate-actions">
              <button 
                className="dev-tools__appstate-button"
                onClick={refreshAppState}
                disabled={isAppStateLoading}
              >
                <RefreshCw size={14} className={isAppStateLoading ? 'rotating' : ''} />
                <span>Refresh</span>
              </button>
              
              <button 
                className="dev-tools__appstate-button"
                onClick={updateAppState}
              >
                <Save size={14} />
                <span>Push Changes</span>
              </button>
            </div>
          </div>
          
          <div className="dev-tools__appstate-editor">
            <div className="dev-tools__editor-header">AppState (JSON)</div>
            <MonacoEditor
              height="100%"
              language="json"
              theme="vs-dark"
              value={currentAppState}
              onChange={(value) => setCurrentAppState(value || '{}')}
              options={{
                readOnly: false,
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

      {/* Collaboration Events Content */}
      {activeSection === 'collab' && activeTab === 'receive' && (
        <div className="dev-tools__pointer-tracker">
          <div className="dev-tools__pointer-tracker-header">
            <div className="dev-tools__pointer-tracker-icon">
              <Move size={14} />
            </div>
            <div className="dev-tools__pointer-tracker-title">
              Cursor Positions (Canvas Coordinates)
            </div>
          </div>
        </div>
      )}
      
      <div className="dev-tools__content">
        {activeSection === 'collab' && activeTab === 'receive' ? (
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
        ) : activeSection === 'collab' && activeTab === 'emit' ? (
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
        ) : activeSection === 'testing' ? (
          <div className="dev-tools__appstate-container">
            <div className="dev-tools__appstate-controls">
              <div className="dev-tools__appstate-header">
                <h3>Testing Tools</h3>
                <p>Various tools for testing Excalidraw functionality.</p>
              </div>
              
              <div className="dev-tools__appstate-actions">
                <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#e0e0e0' }}>Collaborator Tools</h4>
                <button 
                  className="dev-tools__appstate-button"
                  onClick={createRandomCollaborator}
                >
                  <Plus size={14} />
                  <span>Add Random Collaborator</span>
                </button>
                
                {collaboratorCount > 0 && (
                  <div className="dev-tools__collab-empty" style={{ textAlign: 'center', marginTop: '12px' }}>
                    {collaboratorCount} collaborator{collaboratorCount !== 1 ? 's' : ''} added
                  </div>
                )}
                
                <div style={{ marginTop: '24px', borderTop: '1px solid #444', paddingTop: '16px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#e0e0e0' }}>WebSocket Connection</h4>
                  
                  <div style={{ marginBottom: '12px' }}>
                    <input
                      type="text"
                      value={roomId}
                      onChange={(e) => setRoomId(e.target.value)}
                      placeholder="Room ID"
                      disabled={isConnected}
                      style={{
                        width: '90%',
                        padding: '8px',
                        backgroundColor: '#2d2d2d',
                        border: '1px solid #444',
                        borderRadius: '4px',
                        color: '#e0e0e0',
                        fontSize: '12px',
                        marginBottom: '8px'
                      }}
                    />
                    
                    {isConnected ? (
                      <button 
                        className="dev-tools__appstate-button"
                        onClick={handleDisconnect}
                        style={{ backgroundColor: '#dc3545' }}
                      >
                        <Radio size={14} />
                        <span>Disconnect</span>
                      </button>
                    ) : (
                      <button 
                        className="dev-tools__appstate-button"
                        onClick={handleConnect}
                      >
                        <Radio size={14} />
                        <span>Connect</span>
                      </button>
                    )}
                  </div>
                  
                  <div className="dev-tools__collab-empty" style={{ textAlign: 'center' }}>
                    {isConnected ? (
                      <span style={{ color: '#4caf50' }}>Connected to room: {roomId}</span>
                    ) : (
                      <span>Not connected</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="dev-tools__appstate-editor">
              <div className="dev-tools__editor-header">Testing Information</div>
              <div style={{ padding: '16px', color: '#e0e0e0', fontSize: '14px', lineHeight: '1.5' }}>
                <p>This section provides tools for testing Excalidraw functionality:</p>
                <ul style={{ paddingLeft: '20px' }}>
                  <li><strong>Add Random Collaborator</strong>: Creates a random collaborator in the appstate with a random position.</li>
                  <li><strong>WebSocket Connection</strong>: Connect to a collaboration room to send and receive events in real-time.</li>
                </ul>
                <p>WebSocket Connection Usage:</p>
                <ol style={{ paddingLeft: '20px' }}>
                  <li>Enter a room ID in the input field.</li>
                  <li>Click "Connect" to establish a WebSocket connection.</li>
                  <li>Once connected, all collaboration events will be sent to and received from the server.</li>
                  <li>Use the "Emit Custom Event" tab in the Collaboration Events section to send test events.</li>
                  <li>Click "Disconnect" to close the connection.</li>
                </ol>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default DevTools;