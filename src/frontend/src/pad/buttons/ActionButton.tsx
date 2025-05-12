import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Braces, Settings, Plus, ExternalLink, Monitor } from 'lucide-react';
import { ActionType, TargetType, CodeVariant, ActionButtonProps } from './types';
import './ActionButton.scss';
// import { capture } from '../../utils/posthog';
import { ExcalidrawElementFactory, PlacementMode } from '../../lib/ExcalidrawElementFactory';

// Interface for button settings stored in customData
interface ButtonSettings {
  target: TargetType;
  codeVariant?: CodeVariant;
  action: ActionType;
}


const ActionButton: React.FC<ActionButtonProps> = ({ 
  target: initialTarget, 
  label,
  allowedActions = ['embed', 'open-tab', 'magnet'],
  initialAction,
  initialCodeVariant = 'vscode',
  initialShowOptions = false,
  onSettingsToggle,
  element, // Parent Excalidraw element
  excalidrawAPI, // Excalidraw API instance
  settingsEnabled = true, // Default to enabled for backward compatibility
  backgroundColor // Custom background color
}) => {
  const workspaceState = { //TODO
    status: 'running',
    username: 'pad.ws',
    name: 'pad.ws',
    base_url: 'https://pad.ws',
    agent: 'pad.ws'
  }
  
  // Parse settings from parent element's customData if available
  const parseElementSettings = (): { 
    target: TargetType | undefined, 
    codeVariant: CodeVariant | undefined, 
    action: ActionType | undefined 
  } => {
    // If no element or element doesn't have customData with buttonSettings
    if (!element || !element.customData || !element.customData.buttonSettings) {
      // Check if element has link that starts with !button
      if (element && element.link && (element.link === '!button' || element.link.startsWith('!button/'))) {
        // For just !button with no parameters, return defaults
        return { 
          target: 'code' as TargetType, 
          codeVariant: 'vscode' as CodeVariant, 
          action: undefined 
        };
      }
      return { target: undefined, codeVariant: undefined, action: undefined };
    }
    
    // Get settings from customData
    const settings = element.customData.buttonSettings as ButtonSettings;
    return {
      target: settings.target,
      codeVariant: settings.codeVariant,
      action: settings.action
    };
  };
  
  // Get settings from element customData if available
  const elementSettings = parseElementSettings();
  
  const [selectedTarget, setSelectedTarget] = useState<TargetType>(
    elementSettings.target || initialTarget
  );
  
  const [selectedCodeVariant, setSelectedCodeVariant] = useState<CodeVariant>(
    elementSettings.codeVariant || initialCodeVariant
  );
  
  const [selectedAction, setSelectedAction] = useState<ActionType>(() => {
    // First try to use action from customData
    if (elementSettings.action && allowedActions.includes(elementSettings.action)) {
      return elementSettings.action;
    }
    // Then try to use initialAction prop
    if (initialAction && allowedActions.includes(initialAction)) {
      return initialAction;
    }
    // Fallback to first allowed action
    return allowedActions[0] || 'embed';
  });

  // Generate button settings object for customData
  const generateButtonSettings = (): ButtonSettings => {
    const settings: ButtonSettings = {
      target: selectedTarget,
      action: selectedAction
    };
    
    // Add code variant if target is code
    if (selectedTarget === 'code') {
      settings.codeVariant = selectedCodeVariant;
    }
    
    return settings;
  };

  // Use a ref to track the current settings to prevent unnecessary updates
  const currentSettingsRef = useRef<ButtonSettings | null>(null);

  // Update the parent element's customData when settings change
  const updateParentElementSettings = () => {
    // Only update the settings if settings are enabled
    if (settingsEnabled && element && excalidrawAPI) {
      const newSettings = generateButtonSettings();
      
      // Check if settings have changed
      const currentSettings = element.customData?.buttonSettings;
      const settingsChanged = !currentSettings || 
        currentSettings.target !== newSettings.target ||
        currentSettings.codeVariant !== newSettings.codeVariant ||
        currentSettings.action !== newSettings.action;
      
      if (settingsChanged) {
        // Update our ref to the new settings
        currentSettingsRef.current = newSettings;
        
        // Get all elements from the scene
        const elements = excalidrawAPI.getSceneElements();
        
        // Find and update the parent element
        const updatedElements = elements.map(el => {
          if (el.id === element.id) {
            // Create a new customData object with the updated buttonSettings
            const customData = {
              ...(el.customData || {}),
              buttonSettings: newSettings
            };
            
            return { ...el, customData };
          }
          return el;
        });
        
        // Update the scene with the modified elements
        excalidrawAPI.updateScene({
          elements: updatedElements
        });
        
      }
    }
  };

  // Initialize the current settings ref with the element's customData or generated settings
  // Also update component state if the element customData has changed externally
  useEffect(() => {
    if (element) {
      const currentSettings = element.customData?.buttonSettings;
      
      // If the element has customData with buttonSettings and it's different from our ref
      if (currentSettings && 
          (!currentSettingsRef.current || 
           currentSettings.target !== currentSettingsRef.current.target ||
           currentSettings.codeVariant !== currentSettingsRef.current.codeVariant ||
           currentSettings.action !== currentSettingsRef.current.action)) {
        
        // Only update state if we have valid settings from customData
        if (currentSettings.target) {
          setSelectedTarget(currentSettings.target);
          
          if (currentSettings.target === 'code' && currentSettings.codeVariant) {
            setSelectedCodeVariant(currentSettings.codeVariant);
          }
          
          if (currentSettings.action && allowedActions.includes(currentSettings.action)) {
            setSelectedAction(currentSettings.action);
          }
        }
      }
      
      // Always update the current settings ref
      currentSettingsRef.current = currentSettings || generateButtonSettings();
    } else {
      currentSettingsRef.current = generateButtonSettings();
    }
  }, [element, element?.customData, allowedActions]);

  
  useEffect(() => {
    
    if (selectedTarget === 'terminal' && selectedAction === 'magnet') {
      
      const nonDesktopAction = allowedActions.find(action => action !== 'magnet');
      if (nonDesktopAction) {
        setSelectedAction(nonDesktopAction);
      }
    }
    
    
    if (selectedTarget === 'code' && selectedCodeVariant === 'cursor' && selectedAction !== 'magnet') {
      
      if (allowedActions.includes('magnet')) {
        setSelectedAction('magnet');
      } else {
        
        setSelectedAction('magnet');
      }
    }
  }, [allowedActions, selectedTarget, selectedCodeVariant, selectedAction]);

  // Separate effect for updating the settings to avoid infinite loops
  useEffect(() => {
    // Only update after initial render and when settings actually change
    if (currentSettingsRef.current !== null) {
      updateParentElementSettings();
    }
  }, [selectedTarget, selectedCodeVariant, selectedAction]);
  const [showOptions, setShowOptions] = useState<boolean>(initialShowOptions);
  const [compactMode, setCompactMode] = useState<number>(0); // 0: normal, 1: hide settings, 2: hide icon, 3: replace action text with icon, 4: ultra compact
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!wrapperRef.current) return;
    
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        
        if (width < 100) {
          setCompactMode(5); // Ultra compact: only show action icon
        } else if (width < 150) {
          setCompactMode(4); // Intermediate mode: show only main text, hide action icon
        } else if (width < 250) {
          setCompactMode(3); // Very compact: show main text and action icon, hide target icon
        } else if (width < 320) {
          setCompactMode(2); // Compact: hide target icon, show action text
        } else if (width < 410) {
          setCompactMode(1); // Slightly compact: hide settings icon
        } else {
          setCompactMode(0); // Normal: show everything
        }
      }
    });
    
    resizeObserver.observe(wrapperRef.current);
    
    return () => {
      resizeObserver.disconnect();
    };
  }, []);
  
  // Get the appropriate action icon component based on the selected action
  const getActionIcon = () => {
    switch (selectedAction) {
      case 'embed':
        return Plus;
      case 'open-tab':
        return ExternalLink;
      case 'magnet':
        return Monitor;
      default:
        return Plus;
    }
  };
  
  const getButtonLabelParts = () => {
    if (label) return { mainText: label, actionText: '' };
    
    const selectedCodeVariantName = selectedCodeVariant === 'vscode' ? 'VSCode' : 'Cursor';
    const targetName = selectedTarget === 'terminal' ? 'Terminal' : 
                       (selectedTarget === 'code' ? selectedCodeVariantName : 'Code');
    
    let actionText = '';
    switch (selectedAction) {
      case 'embed':
        actionText = `(in pad)`;
        break;
      case 'open-tab':
        actionText = `(new tab)`;
        break;
      case 'magnet':
        actionText = `(desktop)`;
        break;
    }
    
    return { mainText: `${targetName}`, actionText };
  };
  
  
  const getCodeUrl = () => {
    if (!workspaceState) {
      return '';
    }
    
    return `${workspaceState.base_url}/@${workspaceState.username}/${workspaceState.name}.${workspaceState.agent}/apps/code-server`;
  };
  
  // Placement logic has been moved to ExcalidrawElementFactory.placeInScene

  
  const executeAction = () => {
    /* capture('action_button_clicked', {
      target: selectedTarget,
      action: selectedAction,
      codeVariant: selectedTarget === 'code' ? selectedCodeVariant : null
    }); */  //TODO
    
    if (selectedAction === 'embed') {
      const excalidrawAPI = (window as any).excalidrawAPI;
      if (!excalidrawAPI) {
        console.error('Excalidraw API not available');
        return;
      }
      
      // Determine the link to use
      let link: string;
      
      if (selectedTarget === 'terminal') {
        // For terminal, use the !terminal embed link
        link = '!terminal';
      } else {
        // For code, use the code URL
        const codeUrl = getCodeUrl();
        if (!codeUrl) {
          console.error('Could not determine URL for embedding');
          return;
        }
        link = codeUrl;
      }
      
      // Create element directly with ExcalidrawElementFactory
      const newElement = ExcalidrawElementFactory.createEmbeddableElement({
        link,
        width: 600,
        height: 400,
      });
      
      // Place the element in the scene
      ExcalidrawElementFactory.placeInScene(newElement, excalidrawAPI, {
        mode: PlacementMode.NEAR_VIEWPORT_CENTER,
        bufferPercentage: 10,
        scrollToView: true
      });
      
      console.debug(`[pad.ws] Embedded ${selectedTarget}`);
      
    } else if (selectedAction === 'open-tab') {
      if (selectedTarget === 'terminal') {
        // For terminal, open the terminal URL in a new tab
        if (!workspaceState) {
          console.error('Workspace state not available for opening terminal in tab');
          return;
        }
        
        const terminalUrl = `${workspaceState.base_url}/@${workspaceState.username}/${workspaceState.name}.${workspaceState.agent}/terminal`;
        console.debug(`[pad.ws] Opening terminal in new tab: ${terminalUrl}`);
        window.open(terminalUrl, '_blank');
      } else {
        // For code, open the code URL in a new tab
        const codeUrl = getCodeUrl();
        if (!codeUrl) {
          console.error('Could not determine URL for opening in tab');
          return;
        }
        
        console.debug(`[pad.ws] Opening ${selectedTarget} in new tab: ${codeUrl}`);
        window.open(codeUrl, '_blank');
      }
    } else if (selectedAction === 'magnet') {
      if (!workspaceState) {
        console.error('Workspace state not available for magnet link');
        return;
      }
      
      const owner = workspaceState.username;
      const workspace = workspaceState.name;
      const url = workspaceState.base_url;
      const agent = workspaceState.agent;
      
      if (selectedTarget === 'terminal') {
        console.error('Terminal magnet links are not supported');
        return;
      } else if (selectedTarget === 'code') {
        const prefix = selectedCodeVariant === 'cursor' ? 'cursor' : 'vscode';
        const magnetLink = `${prefix}://coder.coder-remote/open?owner=${owner}&workspace=${workspace}&url=${url}&token=&openRecent=true&agent=${agent}`;
        console.debug(`[pad.ws] Opening ${selectedCodeVariant} desktop app with magnet link: ${magnetLink}`);
        window.open(magnetLink, '_blank');
      }
    }
  };
  
  
  const isTabSelected = (tabType: string, value: string) => {
    if (tabType === 'target') {
      return selectedTarget === value;
    } else if (tabType === 'editor') {
      return selectedCodeVariant === value;
    } else if (tabType === 'action') {
      return selectedAction === value;
    }
    return false;
  };

  
  const handleTabClick = (tabType: string, value: string) => {
    if (tabType === 'target') {
      setSelectedTarget(value as TargetType);
    } else if (tabType === 'editor') {
      setSelectedCodeVariant(value as CodeVariant);
    } else if (tabType === 'action') {
      setSelectedAction(value as ActionType);
    }
  };

  
  const toggleOptions = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    const newShowOptions = !showOptions;
    setShowOptions(newShowOptions);
    
    if (onSettingsToggle) {
      onSettingsToggle(newShowOptions);
    }
  };

  // Apply custom background color if provided
  const buttonStyle = backgroundColor ? { backgroundColor } : {};

  // Get the appropriate BEM modifier class based on the selected target and code variant
  const getTypeClassName = () => {
    if (selectedTarget === 'terminal') {
      return 'action-button__wrapper--terminal';
    } else if (selectedTarget === 'code') {
      if (selectedCodeVariant === 'cursor') {
        return 'action-button__wrapper--cursor';
      } else {
        return 'action-button__wrapper--vscode';
      }
    }
    return '';
  };

  return (
    <div 
      ref={wrapperRef}
      className={`action-button__wrapper ${getTypeClassName()} ${
        compactMode === 1 ? 'action-button__wrapper--compact-1' : 
        compactMode === 2 ? 'action-button__wrapper--compact-2' : 
        compactMode === 3 ? 'action-button__wrapper--compact-3' : 
        compactMode === 4 ? 'action-button__wrapper--compact-4' : 
        compactMode === 5 ? 'action-button__wrapper--compact-5' : 'action-button__wrapper--compact-0'
      }`}
    >
      <div className="action-button__main">
        <button 
          className="action-button__container"
          onClick={executeAction}
          style={buttonStyle}
        >
          <div className="action-button__content">
            <div className="action-button__left">
              <span className="action-button__icon">
                {selectedTarget === 'terminal' ? <Terminal className="action-button__icon-svg" /> : <Braces className="action-button__icon-svg" />}
              </span>
              <span className="action-button__text">{getButtonLabelParts().mainText}</span>
            </div>
            <div className="action-button__right">
              <span className="action-button__action-text">{getButtonLabelParts().actionText}</span>
              <span className="action-button__action-icon">
                {React.createElement(getActionIcon(), {
                  className: "action-button__action-icon-svg",
                  'data-action-type': selectedAction
                })}
              </span>
              {settingsEnabled && (
                <span className="action-button__settings-icon" onClick={toggleOptions}>
                  <Settings className="action-button__settings-icon-svg" />
                </span>
              )}
            </div>
          </div>
        </button>
      </div>
      
      {showOptions && (
        <div className="action-tabs__container">
        {/* Target tabs (Terminal/Code) */}
        <div className="action-tabs__row action-tabs__row--target">
          <div 
            className={`action-tabs__item ${isTabSelected('target', 'terminal') ? 'action-tabs__item--selected' : ''}`}
            onClick={() => handleTabClick('target', 'terminal')}
          >
            Terminal
          </div>
          <div 
            className={`action-tabs__item ${isTabSelected('target', 'code') ? 'action-tabs__item--selected' : ''}`}
            onClick={() => handleTabClick('target', 'code')}
          >
            Code
          </div>
        </div>
        
        {/* Editor tabs (VSCode/Cursor) - Only shown when Code is selected */}
        {selectedTarget === 'code' && (
          <div className="action-tabs__row action-tabs__row--editor">
            <div 
              className={`action-tabs__item ${isTabSelected('editor', 'vscode') ? 'action-tabs__item--selected' : ''}`}
              onClick={() => handleTabClick('editor', 'vscode')}
            >
              VSCode
            </div>
            <div 
              className={`action-tabs__item ${isTabSelected('editor', 'cursor') ? 'action-tabs__item--selected' : ''}`}
              onClick={() => handleTabClick('editor', 'cursor')}
            >
              Cursor
            </div>
          </div>
        )}
        
        {/* Action tabs (In Pad/New Tab/Desktop) */}
        <div className="action-tabs__row action-tabs__row--action">
          {allowedActions.map((action) => {
            
            if (selectedTarget === 'terminal' && action === 'magnet') {
              return null;
            }
            
            
            if (selectedTarget === 'code' && selectedCodeVariant === 'cursor' && action !== 'magnet') {
              return null;
            }
            
            const label = action === 'embed' ? 'In Pad' : 
                         action === 'open-tab' ? 'New Tab' : 'Desktop';
            
            return (
              <div 
                key={action}
                className={`action-tabs__item ${isTabSelected('action', action) ? 'action-tabs__item--selected' : ''}`}
                onClick={() => handleTabClick('action', action)}
              >
                {label}
              </div>
            );
          })}
          
          {/* Add Desktop option for Cursor if not in allowedActions */}
          {selectedTarget === 'code' && 
           selectedCodeVariant === 'cursor' && 
           !allowedActions.includes('magnet') && (
            <div 
              className={`action-tabs__item ${selectedAction === 'magnet' ? 'action-tabs__item--selected' : ''}`}
              onClick={() => handleTabClick('action', 'magnet')}
            >
              Desktop
            </div>
          )}
        </div>
        </div>
      )}
    </div>
  );
};

export default ActionButton;
