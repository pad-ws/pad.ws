import React, { useState, useRef, useEffect } from 'react';
import './TabContextMenu.scss';

interface TabContextMenuProps {
  x: number;
  y: number;
  padId: string;
  padName: string;
  onRename: (padId: string, newName: string) => void;
  onDelete: (padId: string) => void;
  onClose: () => void;
}

const TabContextMenu: React.FC<TabContextMenuProps> = ({
  x,
  y,
  padId,
  padName,
  onRename,
  onDelete,
  onClose
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(padName);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Position the menu above the cursor
  const style = {
    position: 'fixed' as const,
    top: `${y - 80}px`, // Position above the cursor
    left: `${x}px`,
  };

  // Handle clicks outside the menu to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Focus the input when renaming
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleRenameClick = () => {
    setIsRenaming(true);
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim() !== '') {
      onRename(padId, newName);
      setIsRenaming(false);
      onClose();
    }
  };

  const handleDeleteClick = () => {
    if (window.confirm(`Are you sure you want to delete "${padName}"?`)) {
      onDelete(padId);
      onClose();
    }
  };

  return (
    <div className="tab-context-menu" style={style} ref={menuRef}>
      {isRenaming ? (
        <form onSubmit={handleRenameSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setIsRenaming(false);
                onClose();
              }
            }}
          />
          <button type="submit">Save</button>
        </form>
      ) : (
        <>
          <div className="menu-item" onClick={handleRenameClick}>
            <span className="menu-item__label">Rename</span>
          </div>
          <div className="menu-item delete" onClick={handleDeleteClick}>
            <span className="menu-item__label">Delete</span>
          </div>
        </>
      )}
    </div>
  );
};

export default TabContextMenu;
