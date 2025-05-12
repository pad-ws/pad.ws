import React from 'react';
import './StateIndicator.scss';

export const StateIndicator: React.FC = () => {
  const workspaceState = null; //TODO

  const getState = () => {    
    if (!workspaceState) {
      return { modifier: 'unknown', text: 'Unknown' };
    }

    switch (workspaceState.status) {
      case 'running':
        return { modifier: 'running', text: 'Running' };
      case 'starting':
        return { modifier: 'starting', text: 'Starting' };
      case 'stopping':
        return { modifier: 'stopping', text: 'Stopping' };
      case 'stopped':
        return { modifier: 'stopped', text: 'Stopped' };
      case 'error':
        return { modifier: 'error', text: 'Error' };
      default:
        return { modifier: 'unknown', text: 'Unknown' };
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
