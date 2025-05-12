import React from 'react';
import './ControlButton.scss';
import { Play, Square, LoaderCircle } from 'lucide-react';

export const ControlButton: React.FC = () => {
  
  const workspaceState = { //TODO
    status: 'running',
    username: 'pad.ws',
    name: 'pad.ws',
    base_url: 'https://pad.ws',
    agent: 'pad.ws',
    error: null
  }

  const isStarting = false; //TODO
  const isStopping = false; //TODO

  // Determine current status
  const currentStatus = workspaceState?.status || 'unknown';

  const handleClick = () => {
    if (isStarting || isStopping) return;
    if (currentStatus === 'running') {
      console.log('TODO: stopWorkspace'); //TODO
    } else if (currentStatus === 'stopped' || currentStatus === 'error') {
      console.log('TODO: startWorkspace'); //TODO
    }
  };

  if (currentStatus === 'starting' || currentStatus === 'stopping' || isStarting || isStopping) {
    return (
      <button
        className="control-button control-button--disabled"
        disabled={true}
        aria-label="Loading"
      >
        <LoaderCircle className="control-icon control-icon--loading" />
      </button>
    );
  } else if (currentStatus === 'running' && (!workspaceState || !workspaceState.error)) {
    return (
      <button
        onClick={handleClick}
        className="control-button"
        aria-label="Stop VM"
      >
        <Square className="control-icon" color="black" />
      </button>
    );
  } else {
    return (
      <button
        onClick={handleClick}
        className="control-button"
        aria-label="Start VM"
      >
        <Play className="control-icon" color="black" />
      </button>
    );
  }
};

export default ControlButton;
