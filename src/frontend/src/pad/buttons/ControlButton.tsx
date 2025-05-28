import React from 'react';
import './ControlButton.scss';
import { Play, Square, LoaderCircle } from 'lucide-react';
import { useWorkspace } from '../../hooks/useWorkspace';

export const ControlButton: React.FC = () => {
  const {
    workspaceState,
    isLoadingState,
    stateError,
    startWorkspace,
    isStarting,
    stopWorkspace,
    isStopping,
  } = useWorkspace();

  let currentUiStatus = 'unknown';
  if (isLoadingState) {
    currentUiStatus = 'loading';
  } else if (stateError) {
    currentUiStatus = 'error';
  } else if (workspaceState) {
    switch (workspaceState.state) {
      case 'pending':
      case 'starting':
        currentUiStatus = 'starting';
        break;
      case 'running':
        currentUiStatus = 'running';
        break;
      case 'stopping':
      case 'canceling':
      case 'deleting':
        currentUiStatus = 'stopping';
        break;
      case 'stopped':
      case 'canceled':
      case 'deleted':
        currentUiStatus = 'stopped';
        break;
      case 'failed':
        currentUiStatus = 'error';
        break;
      default:
        currentUiStatus = 'unknown';
    }
  }

  const handleClick = () => {
    if (isStarting || isStopping || isLoadingState) return;

    if (currentUiStatus === 'running') {
      stopWorkspace();
    } else if (currentUiStatus === 'stopped' || currentUiStatus === 'error' || currentUiStatus === 'unknown') {
      startWorkspace();
    }
  };

  if (currentUiStatus === 'loading' || currentUiStatus === 'starting' || currentUiStatus === 'stopping' || isStarting || isStopping) {
    return (
      <button
        className="control-button control-button--disabled"
        disabled={true}
        aria-label="Loading"
      >
        <LoaderCircle className="control-icon control-icon--loading" />
      </button>
    );
  } else if (currentUiStatus === 'running') {
    return (
      <button
        onClick={handleClick}
        className="control-button"
        aria-label="Stop VM"
      >
        <Square className="control-icon" color="black" />
      </button>
    );
  } else { // Covers 'stopped', 'error', 'unknown'
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
