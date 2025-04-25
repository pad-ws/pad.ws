import React, { useState } from 'react';
import type { NonDeleted, ExcalidrawEmbeddableElement } from '@atyrode/excalidraw/element/types';
import type { AppState } from '@atyrode/excalidraw/types';
import { useCanvasBackups, CanvasBackup } from '../../api/hooks';
import '../styles/CanvasBackups.scss';

interface CanvasBackupsProps {
  element: NonDeleted<ExcalidrawEmbeddableElement>;
  appState: AppState;
  excalidrawAPI?: any;
}

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const CanvasBackups: React.FC<CanvasBackupsProps> = ({
  element,
  appState,
  excalidrawAPI
}) => {
  const { data, isLoading, error } = useCanvasBackups();
  const [selectedBackup, setSelectedBackup] = useState<CanvasBackup | null>(null);

  const handleBackupSelect = (backup: CanvasBackup) => {
    setSelectedBackup(backup);
  };

  const handleRestoreBackup = () => {
    if (selectedBackup && excalidrawAPI) {
      // Load the backup data into the canvas
      excalidrawAPI.updateScene(selectedBackup.data);
      setSelectedBackup(null);
    }
  };

  const handleCancel = () => {
    setSelectedBackup(null);
  };

  if (isLoading) {
    return <div className="canvas-backups canvas-backups--loading">Loading backups...</div>;
  }

  if (error) {
    return <div className="canvas-backups canvas-backups--error">Error loading backups</div>;
  }

  if (!data || data.backups.length === 0) {
    return <div className="canvas-backups canvas-backups--empty">No backups available</div>;
  }

  return (
    <div className="canvas-backups">
      <h2 className="canvas-backups__title">Recent Canvas Backups</h2>
      
      {selectedBackup ? (
        <div className="canvas-backups__confirmation">
          <p>Restore canvas from backup created on {formatDate(selectedBackup.timestamp)}?</p>
          <p className="canvas-backups__warning">This will replace your current canvas!</p>
          <div className="canvas-backups__actions">
            <button 
              className="canvas-backups__button canvas-backups__button--restore" 
              onClick={handleRestoreBackup}
            >
              Restore
            </button>
            <button 
              className="canvas-backups__button canvas-backups__button--cancel" 
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <ul className="canvas-backups__list">
          {data.backups.map((backup) => (
            <li 
              key={backup.id} 
              className="canvas-backups__item"
              onClick={() => handleBackupSelect(backup)}
            >
              <span className="canvas-backups__timestamp">{formatDate(backup.timestamp)}</span>
              <button className="canvas-backups__restore-button">Restore</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default CanvasBackups;
