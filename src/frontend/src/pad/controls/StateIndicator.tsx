import React from 'react';
import { useWorkspaceState, useAuthCheck } from '../../api/hooks';
import '../styles/index.scss';

export const StateIndicator: React.FC = () => {
  const { data: isAuthenticated, isLoading: isAuthLoading } = useAuthCheck();
  const { data: workspaceState, isLoading: isWorkspaceLoading } = useWorkspaceState({
    queryKey: ['workspaceState'],
    enabled: isAuthenticated === true && !isAuthLoading,
  });

  const getStateClassName = () => {
    if (isAuthLoading || isWorkspaceLoading) return 'state-indicator state-indicator--loading';
    if (isAuthenticated === false) return 'state-indicator state-indicator--unauthenticated';
    if (!workspaceState) return 'state-indicator state-indicator--unknown';

    switch (workspaceState.status) {
      case 'running':
        return 'state-indicator state-indicator--running';
      case 'starting':
        return 'state-indicator state-indicator--starting';
      case 'stopping':
        return 'state-indicator state-indicator--stopping';
      case 'stopped':
        return 'state-indicator state-indicator--stopped';
      case 'error':
        return 'state-indicator state-indicator--error';
      default:
        return 'state-indicator state-indicator--unknown';
    }
  };

  const getStateText = () => {
    if (isAuthLoading || isWorkspaceLoading) return 'Loading...';
    if (isAuthenticated === false) return 'Not Authenticated';
    if (!workspaceState) return 'Unknown';

    switch (workspaceState.status) {
      case 'running':
        return 'Running';
      case 'starting':
        return 'Starting';
      case 'stopping':
        return 'Stopping';
      case 'stopped':
        return 'Stopped';
      case 'error':
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className={getStateClassName()}>
      <div className="state-indicator__text">{getStateText()}</div>
    </div>
  );
};

export default StateIndicator;
