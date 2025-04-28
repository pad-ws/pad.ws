import React from 'react';
import { useWorkspaceState, useStartWorkspace, useStopWorkspace } from '../../api/hooks';
import './ControlButton.scss';
import { Play, Square, LoaderCircle } from 'lucide-react';

export const ControlButton: React.FC = () => {
  const { data: workspaceState } = useWorkspaceState({
    queryKey: ['workspaceState'],
    enabled: true,
  });

  const { mutate: startWorkspace, isPending: isStarting } = useStartWorkspace();
  const { mutate: stopWorkspace, isPending: isStopping } = useStopWorkspace();

  // Determine current status
  const currentStatus = workspaceState?.status || 'unknown';

  const handleClick = () => {
    if (isStarting || isStopping) return;
    if (currentStatus === 'running') {
      stopWorkspace();
    } else if (currentStatus === 'stopped' || currentStatus === 'error') {
      startWorkspace();
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
