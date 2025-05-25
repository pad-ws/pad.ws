import React from 'react';
import './StateIndicator.scss';
import { useWorkspace } from '../hooks/useWorkspace';

export const StateIndicator: React.FC = () => {
  const { workspaceState, isLoadingState, stateError } = useWorkspace();

  const getState = () => {
    if (isLoadingState) {
      return { modifier: 'starting', text: 'Loading...' }; // Orange
    }
    if (stateError) {
      return { modifier: 'error', text: 'Error Loading State' }; // Light gray
    }
    if (!workspaceState) {
      return { modifier: 'unknown', text: 'Unknown' }; // Dark gray
    }

    switch (workspaceState.state) {
      case 'pending':
        return { modifier: 'starting', text: 'Pending' }; // Orange
      case 'starting':
        return { modifier: 'starting', text: 'Starting' }; // Orange
      case 'running':
        return { modifier: 'running', text: 'Running' }; // Green
      case 'stopping':
        return { modifier: 'stopping', text: 'Stopping' }; // Orange
      case 'stopped':
        return { modifier: 'stopped', text: 'Stopped' }; // Red
      case 'failed':
        return { modifier: 'error', text: 'Failed' }; // Light gray
      case 'canceling':
        return { modifier: 'stopping', text: 'Canceling' }; // Orange
      case 'canceled':
        return { modifier: 'stopped', text: 'Canceled' }; // Red
      case 'deleting':
        return { modifier: 'stopping', text: 'Deleting' }; // Orange
      case 'deleted':
        return { modifier: 'stopped', text: 'Deleted' }; // Red
      default:
        return { modifier: 'unknown', text: `Unknown (${workspaceState.state})` }; // Dark gray
    }
  };

  const { modifier, text } = getState();

  return (
    <div className={`state-indicator state-indicator--${modifier}`}>
      <div className="state-indicator__text">{text}</div>
    </div>
  );
};

export default StateIndicator;
