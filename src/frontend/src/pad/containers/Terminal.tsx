import React from 'react';
import { useWorkspaceState } from '../../api/hooks';
import type { NonDeleted, ExcalidrawEmbeddableElement } from '@atyrode/excalidraw/element/types';
import type { AppState } from '@atyrode/excalidraw/types';
import './Terminal.scss';

interface TerminalProps {
  element: NonDeleted<ExcalidrawEmbeddableElement>;
  appState: AppState;
  excalidrawAPI?: any;
}

export const Terminal: React.FC<TerminalProps> = ({
  element,
  appState,
  excalidrawAPI
}) => {
  const { data: workspaceState } = useWorkspaceState();
  
  const getTerminalUrl = () => {
    if (!workspaceState) {
      return 'https://terminal.example.dev';
    }
    
    return `${workspaceState.base_url}/@${workspaceState.username}/${workspaceState.workspace_id}.${workspaceState.agent}/terminal`;
  };

  const terminalUrl = getTerminalUrl();

  return (
    <div className="terminal-container">
      <iframe 
        className="terminal-iframe" 
        src={terminalUrl} 
        title="Terminal"
      />
    </div>
  );
};

export default Terminal;
