import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';

import './TabContextMenu.scss';

const CONTEXT_MENU_SEPARATOR = "separator";

type ContextMenuItem = typeof CONTEXT_MENU_SEPARATOR | Action;
type ContextMenuItems = (ContextMenuItem | false | null | undefined)[];

interface Action {
  name: string;
  label: string | (() => string);
  predicate?: () => boolean;
  checked?: (appState: any) => boolean;
  dangerous?: boolean;
}

interface ContextMenuProps {
  actionManager: ActionManager;
  items: ContextMenuItems;
  top: number;
  left: number;
  onClose: (callback?: () => void) => void;
}

interface ActionManager {
  executeAction: (action: Action, source: string) => void;
  app: {
    props: any;
  };
}

interface TabContextMenuProps {
  x: number;
  y: number;
  padId: string;
  padName: string;
  onRename: (padId: string, newName: string) => void;
  onDelete: (padId: string) => void;
  onUpdateSharingPolicy: (padId: string, policy: string) => void;
  onClose: () => void;
}

// Popover component
const Popover: React.FC<{
  onCloseRequest: () => void;
  top: number;
  left: number;
  fitInViewport?: boolean;
  offsetLeft?: number;
  offsetTop?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  children: React.ReactNode;
}> = ({
  onCloseRequest,
  top,
  left,
  children,
  fitInViewport = false,
  offsetLeft = 0,
  offsetTop = 0,
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight
}) => {
    const popoverRef = useRef<HTMLDivElement>(null);

    // Handle clicks outside the popover to close it
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
          onCloseRequest();
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [onCloseRequest]);

    // Adjust position if needed to fit in viewport
    useEffect(() => {
      if (fitInViewport && popoverRef.current) {
        const rect = popoverRef.current.getBoundingClientRect();
        const adjustedLeft = Math.min(left, viewportWidth - rect.width);
        const adjustedTop = Math.min(top, viewportHeight - rect.height);

        if (popoverRef.current) {
          popoverRef.current.style.left = `${adjustedLeft}px`;
          popoverRef.current.style.top = `${adjustedTop}px`;
        }
      }
    }, [fitInViewport, left, top, viewportWidth, viewportHeight]);

    return (
      <div
        ref={popoverRef}
        style={{
          position: 'fixed',
          top: `${top}px`,
          left: `${left}px`,
          zIndex: 1000,
        }}
      >
        {children}
      </div>
    );
  };

// ContextMenu component
const ContextMenu: React.FC<ContextMenuProps> = ({
  actionManager,
  items,
  top,
  left,
  onClose
}) => {
  // Filter items based on predicate
  const filteredItems = items.reduce((acc: ContextMenuItem[], item) => {
    if (
      item &&
      (item === CONTEXT_MENU_SEPARATOR ||
        !item.predicate ||
        item.predicate())
    ) {
      acc.push(item);
    }
    return acc;
  }, []);

  return (
    <Popover
      onCloseRequest={() => {
        onClose();
      }}
      top={top}
      left={left}
      fitInViewport={true}
      viewportWidth={window.innerWidth}
      viewportHeight={window.innerHeight}
    >
      <ul
        className="context-menu"
        onContextMenu={(event) => event.preventDefault()}
      >
        {filteredItems.map((item, idx) => {
          if (item === CONTEXT_MENU_SEPARATOR) {
            if (
              !filteredItems[idx - 1] ||
              filteredItems[idx - 1] === CONTEXT_MENU_SEPARATOR
            ) {
              return null;
            }
            return <hr key={idx} className="context-menu-item-separator" />;
          }

          const actionName = item.name;
          let label = "";
          if (item.label) {
            if (typeof item.label === "function") {
              label = item.label();
            } else {
              label = item.label;
            }
          }

          return (
            <li
              key={idx}
              data-testid={actionName}
              onClick={() => {
                // Store the callback to execute after closing
                const callback = () => {
                  actionManager.executeAction(item, "contextMenu");
                };

                // Close the menu and execute the callback
                onClose(callback);
              }}
            >
              <button
                type="button"
                className={clsx("context-menu-item", {
                  dangerous: item.dangerous || actionName === "deleteSelectedElements",
                  checkmark: item.checked && item.checked({}),
                })}
              >
                <div className="context-menu-item__label">{label}</div>
                <kbd className="context-menu-item__shortcut"></kbd>
              </button>
            </li>
          );
        })}
      </ul>
    </Popover>
  );
};

// Simple ActionManager implementation for the tab context menu
class TabActionManager implements ActionManager {
  padId: string;
  padName: string;
  onRename: (padId: string, newName: string) => void;
  onDelete: (padId: string) => void;
  onUpdateSharingPolicy: (padId: string, policy: string) => void;
  app: any;

  constructor(
    padId: string,
    padName: string,
    onRename: (padId: string, newName: string) => void,
    onDelete: (padId: string) => void,
    onUpdateSharingPolicy: (padId: string, policy: string) => void
  ) {
    this.padId = padId;
    this.padName = padName;
    this.onRename = onRename;
    this.onDelete = onDelete;
    this.onUpdateSharingPolicy = onUpdateSharingPolicy;
    this.app = { props: {} };
  }

  executeAction(action: Action, source: string) {
    if (action.name === 'rename') {
      const newName = window.prompt('Rename pad', this.padName);
      if (newName && newName.trim() !== '') {
        this.onRename(this.padId, newName);
      }
    } else if (action.name === 'delete') {
      console.debug('[pad.ws] Attempting to delete pad:', this.padId, this.padName);
      if (window.confirm(`Are you sure you want to delete "${this.padName}"?`)) {
        console.debug('[pad.ws] User confirmed delete, calling onDelete');
        this.onDelete(this.padId);
      }
    } else if (action.name === 'setPublic') {
      this.onUpdateSharingPolicy(this.padId, 'public');
    } else if (action.name === 'setPrivate') {
      this.onUpdateSharingPolicy(this.padId, 'private');
    }
  }
}

// Main TabContextMenu component
const TabContextMenu: React.FC<TabContextMenuProps> = ({
  x,
  y,
  padId,
  padName,
  onRename,
  onDelete,
  onUpdateSharingPolicy,
  onClose
}) => {
  // Create an action manager instance
  const actionManager = new TabActionManager(padId, padName, onRename, onDelete, onUpdateSharingPolicy);

  // Define menu items
  const menuItems = [
    {
      name: 'rename',
      label: 'Rename',
      predicate: () => true,
    },
    CONTEXT_MENU_SEPARATOR,
    {
      name: 'setPublic',
      label: 'Set Public',
      predicate: () => true,
    },
    {
      name: 'setPrivate',
      label: 'Set Private',
      predicate: () => true,
    },
    CONTEXT_MENU_SEPARATOR,
    {
      name: 'delete',
      label: 'Delete',
      predicate: () => true,
      dangerous: true,
    }
  ];

  // Create a wrapper for onClose that handles the callback
  const handleClose = (callback?: () => void) => {
    onClose();
    if (callback) {
      callback();
    }
  };

  return (
    <ContextMenu
      actionManager={actionManager}
      items={menuItems}
      top={y - 80} // Position above the cursor
      left={x}
      onClose={handleClose}
    />
  );
};

export default TabContextMenu;