import React from 'react';
import { useWorkspaceState, useAuthCheck } from '../api/hooks';
import './StateIndicator.scss';

export const StateIndicator: React.FC = () => {
  const { data: isAuthenticated, isLoading: isAuthLoading } = useAuthCheck();
  
  // Only fetch workspace state if authenticated
  const { data: workspaceState, isLoading: isWorkspaceLoading } = useWorkspaceState({
    queryKey: ['workspaceState'],
    enabled: isAuthenticated === true && !isAuthLoading,
    // Explicitly set refetchInterval to false when not authenticated
    refetchInterval: isAuthenticated === true ? undefined : false,
  });

  const getState = () => {
    if (isAuthLoading || isWorkspaceLoading) {
      return { modifier: 'loading', text: 'Loading...' };
    }
    
    if (isAuthenticated === false) {
      return { modifier: 'unauthenticated', text: 'Not Authenticated' };
    }
    
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
