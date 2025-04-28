import React, { useState, useRef, useEffect } from 'react';
import type { NonDeleted, ExcalidrawEmbeddableElement } from '@atyrode/excalidraw/element/types';
import type { AppState } from '@atyrode/excalidraw/types';
import StateIndicator from '../controls/StateIndicator';
import ControlButton from '../controls/ControlButton';
import { ActionButtonGrid } from '../buttons';
import { useWorkspaceState } from '../../api/hooks';
import './Dashboard.scss';

// Direct import from types
type TargetType = 'terminal' | 'code';
type CodeVariant = 'vscode' | 'cursor';
type ActionType = 'embed' | 'open-tab' | 'magnet';

// Define ActionButtonConfig interface locally
interface ActionButtonConfig {
  target: TargetType;
  initialCodeVariant?: CodeVariant;
  initialAction: ActionType;
  allowedActions: ActionType[];
  initialShowOptions?: boolean;
}

interface DashboardProps {
  element: NonDeleted<ExcalidrawEmbeddableElement>;
  appState: AppState;
  excalidrawAPI?: any;
}

export const Dashboard: React.FC<DashboardProps> = ({
  element,
  appState,
  excalidrawAPI
}) => {
  const { data: workspaceState } = useWorkspaceState();

  const buttonConfigs: ActionButtonConfig[] = [
    // First row: Terminal buttons
    {
      target: 'terminal' as TargetType,
      initialAction: 'embed' as ActionType,
      allowedActions: ['embed', 'open-tab'] as ActionType[],
      initialShowOptions: false
    },

    {
      target: 'terminal' as TargetType,
      initialAction: 'open-tab' as ActionType,
      allowedActions: ['embed', 'open-tab'] as ActionType[],
      initialShowOptions: false
    },

    // Second row: VSCode buttons
    {
      target: 'code' as TargetType,
      initialCodeVariant: 'vscode' as CodeVariant,
      initialAction: 'embed' as ActionType,
      allowedActions: ['embed', 'open-tab', 'magnet'] as ActionType[],
      initialShowOptions: false
    },

    {
      target: 'code' as TargetType,
      initialCodeVariant: 'vscode' as CodeVariant,
      initialAction: 'open-tab' as ActionType,
      allowedActions: ['embed', 'open-tab', 'magnet'] as ActionType[],
      initialShowOptions: false
    },

    // Third row: Desktop buttons
    {
      target: 'code' as TargetType,
      initialCodeVariant: 'vscode' as CodeVariant,
      initialAction: 'magnet' as ActionType,
      allowedActions: ['embed', 'open-tab', 'magnet'] as ActionType[],
      initialShowOptions: false
    },

    {
      target: 'code' as TargetType,
      initialCodeVariant: 'cursor' as CodeVariant,
      initialAction: 'magnet' as ActionType,
      allowedActions: ['magnet'] as ActionType[],
      initialShowOptions: false
    },
  ];

  // State to track if there's enough space for the bottom section
  const [showBottomSection, setShowBottomSection] = useState(true);
  // Reference to the dashboard container
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Set up resize observer to check if there's enough space
  useEffect(() => {
    // Minimum height required for the ActionButtonGrid to render properly
    const MIN_REQUIRED_HEIGHT = 200; // Adjust this value based on your design

    const checkSize = () => {
      if (dashboardRef.current) {
        const dashboardHeight = dashboardRef.current.clientHeight;
        // Determine if there's enough space for the bottom section
        setShowBottomSection(dashboardHeight >= MIN_REQUIRED_HEIGHT);
      }
    };

    // Create a ResizeObserver to monitor size changes
    const resizeObserver = new ResizeObserver(checkSize);

    // Start observing the dashboard element
    if (dashboardRef.current) {
      resizeObserver.observe(dashboardRef.current);
    }

    // Initial size check
    checkSize();

    // Clean up the observer when component unmounts
    return () => {
      if (dashboardRef.current) {
        resizeObserver.unobserve(dashboardRef.current);
      }
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="dashboard" ref={dashboardRef}>
      <div className={`dashboard__top-section ${!showBottomSection ? 'dashboard__top-section--full-height' : ''}`}>
        <StateIndicator />
        <ControlButton />
      </div>
      {showBottomSection && (
        <div className="dashboard__bottom-section">
          {workspaceState?.status === 'running' ? (
            <ActionButtonGrid
              buttonConfigs={buttonConfigs}
              element={element}
              excalidrawAPI={excalidrawAPI}
            />
          ) : (
            <div className="dashboard__welcome-message">
              <h1 className="dashboard__welcome-message__title">
                {workspaceState?.status === 'starting' ? 'Your workspace is starting...' :
                  workspaceState?.status === 'stopping' ? 'Your workspace is stopping...' :
                    workspaceState?.status === 'stopped' ? 'Your workspace is stopped, start it again to continue' :
                      workspaceState?.status === 'error' ? 'Workspace error occurred' :
                        'Loading workspace status...'}
              </h1>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
