import React, { useState, useCallback } from "react";
import { Dialog } from "@atyrode/excalidraw";
import { Pencil, Trash2 } from "lucide-react";
import { useAllPads, useRenamePad, useDeletePad, PadData } from "../api/hooks";
import { loadPadData, getActivePad, setActivePad, saveCurrentPadBeforeSwitching } from "../utils/canvasUtils";
import { queryClient } from "../api/queryClient";
import { capture } from "../utils/posthog";
import "./PadsDialog.scss";

interface PadsDialogProps {
  excalidrawAPI?: any;
  onClose?: () => void;
}

const PadsDialog: React.FC<PadsDialogProps> = ({
  excalidrawAPI,
  onClose,
}) => {
  const [modalIsShown, setModalIsShown] = useState(true);
  const { data: pads, isLoading, error } = useAllPads();
  const activePadId = getActivePad();
  const [editingPadId, setEditingPadId] = useState<string | null>(null);
  const [newPadName, setNewPadName] = useState("");

  // Get the renamePad mutation
  const { mutate: renamePad } = useRenamePad({
    onSuccess: (data, variables) => {
      console.debug("[pad.ws] Pad renamed successfully");
      
      // Update the cache directly instead of refetching
      const { padId, newName } = variables;
      
      // Get the current pads from the query cache
      const currentPads = queryClient.getQueryData<PadData[]>(['allPads']);
      
      if (currentPads) {
        // Create a new array with the updated pad name
        const updatedPads = currentPads.map(pad => 
          pad.id === padId 
            ? { ...pad, display_name: newName } 
            : pad
        );
        
        // Update the query cache with the new data
        queryClient.setQueryData(['allPads'], updatedPads);
      }
      
      // Reset editing state
      setEditingPadId(null);
    },
    onError: (error) => {
      console.error("[pad.ws] Failed to rename pad:", error);
      setEditingPadId(null);
    }
  });
  
  // Get the deletePad mutation
  const { mutate: deletePad } = useDeletePad({
    onSuccess: (data, padId) => {
      console.debug("[pad.ws] Pad deleted successfully");
      
      // Update the cache directly instead of refetching
      // Get the current pads from the query cache
      const currentPads = queryClient.getQueryData<PadData[]>(['allPads']);
      
      if (currentPads) {
        // Create a new array without the deleted pad
        const updatedPads = currentPads.filter(pad => pad.id !== padId);
        
        // Update the query cache with the new data
        queryClient.setQueryData(['allPads'], updatedPads);
      }
    },
    onError: (error) => {
      console.error("[pad.ws] Failed to delete pad:", error);
    }
  });

  const handleClose = useCallback(() => {
    setModalIsShown(false);
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  const handleRenameClick = (pad: PadData) => {
    setEditingPadId(pad.id);
    setNewPadName(pad.display_name);
  };

  const handleRenameSubmit = (padId: string) => {
    if (newPadName.trim() === "") return;
    
    // Track pad rename event
    capture("pad_renamed", {
      padId,
      newName: newPadName
    });
    
    // Call the renamePad mutation
    renamePad({ padId, newName: newPadName });
  };

  const handleDeleteClick = (pad: PadData) => {
    // Don't allow deleting the last pad
    if (pads && pads.length <= 1) {
      alert("Cannot delete the last pad");
      return;
    }
    
    // Confirm deletion
    if (!window.confirm(`Are you sure you want to delete "${pad.display_name}"?`)) {
      return;
    }
    
    // Track pad deletion event
    capture("pad_deleted", {
      padId: pad.id,
      padName: pad.display_name
    });
    
    // If deleting the active pad, switch to another pad first but keep dialog open
    if (pad.id === activePadId && pads) {
      const otherPad = pads.find(p => p.id !== pad.id);
      if (otherPad && excalidrawAPI) {
        handleLoadPad(otherPad, true); // Pass true to keep dialog open
      }
    }
    
    // Call the deletePad mutation
    deletePad(pad.id);
  };

  const handleLoadPad = (pad: PadData, keepDialogOpen: boolean = false) => {
    if (!excalidrawAPI) return;
    
    // Save the current canvas before switching tabs
    if (activePadId) {
      saveCurrentPadBeforeSwitching(excalidrawAPI, activePadId, (data) => {
        console.debug("[pad.ws] Canvas saved before switching");
      });
    }
    
    // Set the new active pad ID
    setActivePad(pad.id);
    
    // Load the pad data
    loadPadData(excalidrawAPI, pad.id, pad.data);
    
    // Close the dialog only if keepDialogOpen is false
    if (!keepDialogOpen) {
      handleClose();
    }
  };

  // Format date function
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

  // Dialog content
  const dialogContent = (
    <div className="pads-dialog__content">
      {isLoading ? (
        <div className="pads-dialog__loading">Loading pads...</div>
      ) : error ? (
        <div className="pads-dialog__error">Error loading pads</div>
      ) : !pads || pads.length === 0 ? (
        <div className="pads-dialog__empty">No pads available</div>
      ) : (
        <ul className="pads-dialog__list">
          {pads.map((pad) => (
            <li 
              key={pad.id} 
              className={`pads-dialog__item ${pad.id === activePadId ? 'pads-dialog__item--active' : ''}`}
            >
              {editingPadId === pad.id ? (
                <div className="pads-dialog__edit-form">
                  <input
                    type="text"
                    value={newPadName}
                    onChange={(e) => setNewPadName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleRenameSubmit(pad.id);
                      } else if (e.key === 'Escape') {
                        setEditingPadId(null);
                      }
                    }}
                  />
                  <div className="pads-dialog__edit-actions">
                    <button 
                      className="pads-dialog__button pads-dialog__button--save" 
                      onClick={() => handleRenameSubmit(pad.id)}
                    >
                      Save
                    </button>
                    <button 
                      className="pads-dialog__button pads-dialog__button--cancel" 
                      onClick={() => setEditingPadId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div 
                    className={`pads-dialog__item-content ${pad.id === activePadId ? 'pads-dialog__item-content--current' : 'pads-dialog__item-content--clickable'}`}
                    onClick={() => pad.id !== activePadId && handleLoadPad(pad)}
                  >
                    <span className="pads-dialog__name">
                      {pad.display_name}
                      {pad.id === activePadId && <span className="pads-dialog__current"> (current)</span>}
                    </span>
                    <div className="pads-dialog__timestamps">
                      <span className="pads-dialog__timestamp">Created: {formatDate(pad.created_at)}</span>
                      <span className="pads-dialog__timestamp">Last updated: {formatDate(pad.updated_at || pad.created_at)}</span>
                    </div>
                  </div>
                  <div className="pads-dialog__actions">
                    <button 
                      className="pads-dialog__icon-button" 
                      onClick={() => handleRenameClick(pad)}
                      title="Rename pad"
                    >
                      <Pencil size={18} />
                    </button>
                    <button 
                      className="pads-dialog__icon-button" 
                      onClick={() => handleDeleteClick(pad)}
                      title="Delete pad"
                      disabled={pads.length <= 1}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <>
      {modalIsShown && (
        <div className="pads-dialog__wrapper">
          <Dialog
            className="pads-dialog"
            size="small"
            onCloseRequest={handleClose}
            title={
              <div className="pads-dialog__title-container">
                <h2 className="pads-dialog__title">
                  Manage Pads
                </h2>
              </div>
            }
            closeOnClickOutside={true}
            children={dialogContent}
          />
        </div>
      )}
    </>
  );
};

export default PadsDialog;
