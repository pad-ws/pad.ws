import React, { useEffect, useRef, useState } from 'react';
import './styles/CapsLockOverlay.scss';
import { debounce } from './utils/debounce';

interface CapsLockOverlayProps {
  containerRef: React.RefObject<HTMLElement>;
}

const CapsLockOverlay: React.FC<CapsLockOverlayProps> = ({ containerRef }) => {
  const [compactMode, setCompactMode] = useState<number>(0); // 0: normal, 1: inline, 2: text only, 3: icon only
  const [heightCompact, setHeightCompact] = useState<boolean>(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Store the previous dimensions to avoid unnecessary updates
  const prevDimensions = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  
  useEffect(() => {
    if (!containerRef.current || !overlayRef.current) return;
    
    // Debounced function to update compact modes
    const updateCompactModes = debounce((width: number, height: number) => {
      // Only update if dimensions have changed significantly (at least 5px difference)
      if (
        Math.abs(prevDimensions.current.width - width) < 5 &&
        Math.abs(prevDimensions.current.height - height) < 5
      ) {
        return;
      }
      
      // Update previous dimensions
      prevDimensions.current = { width, height };
      
      // Determine compact mode based on width
      let newCompactMode;
      if (width < 150) {
        newCompactMode = 3; // Ultra compact: only show lock icon
      } else if (width < 250) {
        newCompactMode = 2; // Compact: only show text
      } else if (width < 400) {
        newCompactMode = 1; // Slightly compact: show lock icon and text inline
      } else {
        newCompactMode = 0; // Normal: show lock icon above text
      }
      
      // Use functional updates to avoid dependency on current state
      setCompactMode(prevMode => {
        return newCompactMode !== prevMode ? newCompactMode : prevMode;
      });
      
      // Determine height compact mode
      const newHeightCompact = height < 100;
      setHeightCompact(prevHeightCompact => {
        return newHeightCompact !== prevHeightCompact ? newHeightCompact : prevHeightCompact;
      });
    }, 50); // 50ms debounce
    
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        const height = entry.contentRect.height;
        
        // Use the debounced update function
        updateCompactModes(width, height);
      }
    });
    
    // Initial size check
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      updateCompactModes(width, height);
    }
    
    resizeObserver.observe(containerRef.current);
    
    return () => {
      resizeObserver.disconnect();
      updateCompactModes.cancel();
    };
  }, [containerRef]);

  // Render the lock icon
  const renderLockIcon = () => {
    // Don't show icon in text-only mode or when height is very compact
    if (compactMode === 2 || (heightCompact && compactMode !== 3)) {
      return null;
    }

    const iconSize = heightCompact ? 28 : compactMode === 3 ? 48 : compactMode === 1 ? 32 : 40;
    
    return (
      <div 
        className={`caps-lock-icon ${compactMode === 1 ? 'inline' : ''}`}
        style={{ 
          width: iconSize, 
          height: iconSize,
          marginBottom: compactMode === 0 ? '8px' : 0,
          marginRight: compactMode === 1 ? '8px' : 0
        }}
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width={iconSize} 
          height={iconSize} 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
    );
  };

  // Render the title (Caps Lock ON)
  const renderTitle = () => {
    // Don't show title in icon-only mode
    if (compactMode === 3) {
      return null;
    }

    const fontSize = heightCompact ? 11 : (compactMode === 2 ? 14 : 16);
    
    return (
      <div 
        className="caps-lock-title"
        style={{ 
          fontSize: `${fontSize}px`,
          lineHeight: heightCompact ? 1.1 : 1.4,
          fontWeight: 'bold'
        }}
      >
        Caps Lock ON
      </div>
    );
  };

  // Render the subtext (You can move and edit...)
  const renderSubtext = () => {
    // Don't show subtext in compact modes or when height is limited
    if (compactMode >= 2 || heightCompact) {
      return null;
    }

    const fontSize = compactMode === 1 ? 12 : 13;
    
    return (
      <div 
        className="caps-lock-subtext"
        style={{ 
          fontSize: `${fontSize}px`,
          lineHeight: 1.3,
          opacity: 0.8,
          marginTop: '4px'
        }}
      >
        You can move and edit this element
      </div>
    );
  };

  // Determine the layout classes
  const getLayoutClasses = () => {
    const classes = [];
    
    // Add mode-specific class
    if (compactMode === 1) classes.push('inline-layout');
    else if (compactMode === 2) classes.push('text-only-mode');
    else if (compactMode === 3) classes.push('icon-only-mode');
    
    // Add height compact class if needed
    if (heightCompact) classes.push('height-compact');
    
    return classes.join(' ');
  };

  return (
    <div 
      ref={overlayRef}
      className={`caps-lock-overlay ${getLayoutClasses()}`}
    >
      <div className="caps-lock-splash">
        {renderLockIcon()}
        {renderTitle()}
        {renderSubtext()}
      </div>
    </div>
  );
};

export default CapsLockOverlay;
