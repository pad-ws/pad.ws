import React, { useState } from "react";
import Modal from "./Modal";
import { useCanvasBackups, CanvasBackup } from "../api/hooks";
import "../styles/BackupsModal.scss";

interface BackupsModalProps {
  excalidrawAPI?: any;
  isExiting?: boolean;
  onExitComplete?: () => void;
  onClose?: () => void;
}

const BackupsModal: React.FC<BackupsModalProps> = ({
  excalidrawAPI,
  isExiting = false,
  onExitComplete,
  onClose,
}) => {
  const { data, isLoading, error } = useCanvasBackups();
  const [selectedBackup, setSelectedBackup] = useState<CanvasBackup | null>(null);

  // Functions from CanvasBackups.tsx
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

  // Format date function from CanvasBackups.tsx
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

  return (
    <Modal
      logoSrc="/assets/images/favicon.png"
      logoAlt="pad.ws logo"
      className="backups-modal"
      isExiting={isExiting}
      onExitComplete={onExitComplete}
    >
      <div className="backups-modal__content">
        <div className="backups-modal__header">
          <h2 className="backups-modal__title">Canvas Backups</h2>
          <button 
            className="backups-modal__close-button" 
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        
        {isLoading ? (
          <div className="backups-modal__loading">Loading backups...</div>
        ) : error ? (
          <div className="backups-modal__error">Error loading backups</div>
        ) : !data || data.backups.length === 0 ? (
          <div className="backups-modal__empty">No backups available</div>
        ) : selectedBackup ? (
          <div className="backups-modal__confirmation">
            <p>Restore canvas from backup #{data.backups.findIndex(b => b.id === selectedBackup.id) + 1} created on {formatDate(selectedBackup.timestamp)}?</p>
            <p className="backups-modal__warning">This will replace your current canvas!</p>
            <div className="backups-modal__actions">
              <button 
                className="backups-modal__button backups-modal__button--restore" 
                onClick={handleRestoreBackup}
              >
                Restore
              </button>
              <button 
                className="backups-modal__button backups-modal__button--cancel" 
                onClick={handleCancel}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <ul className="backups-modal__list">
            {data.backups.map((backup, index) => (
              <li 
                key={backup.id} 
                className="backups-modal__item"
                onClick={() => handleBackupSelect(backup)}
              >
                <div className="backups-modal__item-content">
                  <span className="backups-modal__number">#{index + 1}</span>
                  <span className="backups-modal__timestamp">{formatDate(backup.timestamp)}</span>
                </div>
                <button className="backups-modal__restore-button">Restore</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
};

export default BackupsModal;
