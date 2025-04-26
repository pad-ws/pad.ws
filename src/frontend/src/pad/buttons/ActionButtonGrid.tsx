import React from 'react';
import ActionButton from './ActionButton';
import { TargetType, CodeVariant, ActionType } from './types';
import './ActionButtonGrid.scss';

// Function to get button background color based on target and variant
const getButtonColor = (target: TargetType, codeVariant?: CodeVariant): string => {
  if (target === 'terminal') {
    return '#007249'; // Green for terminal
  } else if (target === 'code') {
    if (codeVariant === 'cursor') {
      return '#5b2c2c'; // Darker red for Cursor
    } else {
      return '#144062'; // Blue for VSCode
    }
  }
  return '#4a4a54'; // Default color
};


export interface ActionButtonConfig {
  target: TargetType;
  initialCodeVariant?: CodeVariant;
  initialAction: ActionType;
  allowedActions: ActionType[];
  initialShowOptions?: boolean;
}

interface ActionButtonGridProps {
  buttonConfigs: ActionButtonConfig[];
  element?: any; // Parent Excalidraw element
  excalidrawAPI?: any; // Excalidraw API instance
}

const ActionButtonGrid: React.FC<ActionButtonGridProps> = ({ 
  buttonConfigs,
  element,
  excalidrawAPI
}) => {
  // Split the button configs into two groups: first 4 buttons and last 2 buttons
  const firstFourButtons = buttonConfigs.slice(0, 4);
  const lastTwoButtons = buttonConfigs.slice(4, 6);
  
  return (
    <div className="action-button-grid">
      <div className="action-button-grid__container">
        {/* Render first 4 buttons (2 rows) */}
        {firstFourButtons.map((buttonProps, index) => (
          <div 
            key={`top-${index}`} 
            className="action-button-grid__item"
            style={{
              transitionDelay: `${index * 0.05}s`
            }}
          >
            <ActionButton 
              {...buttonProps} 
              element={element}
              excalidrawAPI={excalidrawAPI}
              settingsEnabled={false} // Disable settings in the dashboard
              backgroundColor={getButtonColor(buttonProps.target, buttonProps.initialCodeVariant)}
            />
          </div>
        ))}
        
        {/* Add separator element */}
        <div className="action-button-grid__separator" key="separator"></div>
        
        {/* Bottom row container with equal width buttons */}
        <div className="action-button-grid__bottom-row">
          {/* Render VSCode magnet button */}
          <div className="action-button-grid__bottom-item">
            <ActionButton 
              {...lastTwoButtons[0]} 
              element={element}
              excalidrawAPI={excalidrawAPI}
              settingsEnabled={false}
              backgroundColor={getButtonColor(lastTwoButtons[0].target, lastTwoButtons[0].initialCodeVariant)}
            />
          </div>
          
          {/* Render Cursor magnet button */}
          <div className="action-button-grid__bottom-item">
            <ActionButton 
              {...lastTwoButtons[1]} 
              element={element}
              excalidrawAPI={excalidrawAPI}
              settingsEnabled={false}
              backgroundColor={getButtonColor(lastTwoButtons[1].target, lastTwoButtons[1].initialCodeVariant)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActionButtonGrid;
