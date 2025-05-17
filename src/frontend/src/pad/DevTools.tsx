import React from 'react';
import MonacoEditor from '@monaco-editor/react';
import './DevTools.scss';

interface DevToolsProps {}

const DevTools: React.FC<DevToolsProps> = () => {
  return (
    <div className="dev-tools">
      <div className="dev-tools__content">
        <div className="dev-tools__collab-container">
          <div className="dev-tools__collab-events-wrapper">
              <div className="dev-tools__collab-events">
                <div className="dev-tools__collab-events-header">
                  Events
                </div>
                <div className="dev-tools__collab-events-list">
                  <div className="dev-tools__collab-empty">
                    Event display area.
                  </div>
                </div>
              </div>
            </div>
            <div className="dev-tools__collab-details">
              <div className="dev-tools__editor-header">Event Details</div>
              <MonacoEditor
                height="100%"
                language="json"
                theme="vs-dark"
                value={JSON.stringify({ message: "JSON representation of event data will appear here." }, null, 2)}
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
