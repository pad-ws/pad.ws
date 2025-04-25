import React, { useState, useCallback } from "react";
import { Dialog } from "@atyrode/excalidraw";
import { useCanvasBackups, CanvasBackup } from "../api/hooks";
import { normalizeCanvasData } from "../utils/canvasUtils";
import "../styles/BackupsDialog.scss";

interface BackupsModalProps {
  excalidrawAPI?: any;
  onClose?: () => void;
}

const BackupsModal: React.FC<BackupsModalProps> = ({
  excalidrawAPI,
  onClose,
}) => {
  const [modalIsShown, setModalIsShown] = useState(true);
  const { data, isLoading, error } = useCanvasBackups();
  const [selectedBackup, setSelectedBackup] = useState<CanvasBackup | null>(null);

  // Functions from CanvasBackups.tsx
  const handleBackupSelect = (backup: CanvasBackup) => {
    setSelectedBackup(backup);
  };

  const handleRestoreBackup = () => {
    if (selectedBackup && excalidrawAPI) {
      // Load the backup data into the canvas
      const normalizedData = normalizeCanvasData(selectedBackup.data);
      excalidrawAPI.updateScene(normalizedData);
      setSelectedBackup(null);
      handleClose();
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

  const handleClose = useCallback(() => {
    setModalIsShown(false);
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  // Dialog content
  const dialogContent = (
    <div className="backups-modal__content">
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
  );

  return (
    <>
      {modalIsShown && (
        <div className="backups-modal__wrapper">
          <Dialog
            className="backups-modal"
            size="small"
            onCloseRequest={handleClose}
            title={
              <div className="backups-modal__title-container">
                <h2 className="backups-modal__title">Canvas Backups</h2>
              </div>
            }
            closeOnClickOutside={false}
            children={dialogContent}
          />
        </div>
      )}
    </>
  );
};

export default BackupsModal;
