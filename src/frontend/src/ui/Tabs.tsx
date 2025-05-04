import React, { useState, useEffect, useCallback } from "react";

import type { ExcalidrawImperativeAPI } from "@atyrode/excalidraw/types";
import { Stack, Button, Section, Tooltip } from "@atyrode/excalidraw";
import { FilePlus2 } from "lucide-react";
import { useAllPads, useSaveCanvas, useRenamePad, useDeletePad, PadData } from "../api/hooks";
import { queryClient } from "../api/queryClient";
import { 
  getPadData, 
  storePadData, 
  setActivePad, 
  getStoredActivePad,
  loadPadData,
  saveCurrentPadBeforeSwitching,
  createNewPad
} from "../utils/canvasUtils";
import TabContextMenu from "./TabContextMenu";
import "./Tabs.scss";

interface TabsProps {
  excalidrawAPI: ExcalidrawImperativeAPI;
}

const Tabs: React.FC<TabsProps> = ({
  excalidrawAPI,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
}) => {
    const { data: pads, isLoading } = useAllPads();
    const appState = excalidrawAPI.getAppState();
    const [isCreatingPad, setIsCreatingPad] = useState(false);
    const [activePadId, setActivePadId] = useState<string | null>(null);
    
    // Context menu state
    const [contextMenu, setContextMenu] = useState<{
        visible: boolean;
        x: number;
        y: number;
        padId: string;
        padName: string;
    }>({
        visible: false,
        x: 0,
        y: 0,
        padId: '',
        padName: ''
    });
    
    // Get the saveCanvas mutation
    const { mutate: saveCanvas } = useSaveCanvas({
        onSuccess: () => {
            console.debug("[pad.ws] Canvas saved to database successfully");
        },
        onError: (error) => {
            console.error("[pad.ws] Failed to save canvas to database:", error);
        }
    });
    
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
        },
        onError: (error) => {
            console.error("[pad.ws] Failed to rename pad:", error);
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

    const handlePadSelect = (pad: any) => {
        // Save the current canvas before switching tabs
        if (activePadId) {
            saveCurrentPadBeforeSwitching(excalidrawAPI, activePadId, saveCanvas);
        }
        
        // Set the new active pad ID
        setActivePadId(pad.id);
        // Store the active pad ID globally
        setActivePad(pad.id);
        
        // Load the pad data
        loadPadData(excalidrawAPI, pad.id, pad.data);
    };

    // Set the active pad ID when the component mounts and when the pads data changes
    useEffect(() => {
        if (!isLoading && pads && pads.length > 0 && !activePadId) {
            // Check if there's a stored active pad ID
            const storedActivePadId = getStoredActivePad();
            
            // Find the pad that matches the stored ID, or use the first pad if no match
            let padToActivate = pads[0];
            
            if (storedActivePadId) {
                // Try to find the pad with the stored ID
                const matchingPad = pads.find(pad => pad.id === storedActivePadId);
                if (matchingPad) {
                    console.debug(`[pad.ws] Found stored active pad: ${storedActivePadId}`);
                    padToActivate = matchingPad;
                } else {
                    console.debug(`[pad.ws] Stored active pad ${storedActivePadId} not found in available pads`);
                }
            }
            
            // Set the active pad ID
            setActivePadId(padToActivate.id);
            // Store the active pad ID globally
            setActivePad(padToActivate.id);
            
            // Store all pads in local storage for the first time
            pads.forEach(pad => {
                // Only store if not already in local storage
                if (!getPadData(pad.id)) {
                    storePadData(pad.id, pad.data);
                }
            });
            
            // If the current canvas is empty, load the pad data
            const currentElements = excalidrawAPI.getSceneElements();
            if (currentElements.length === 0) {
                // Load the pad data using the imported function
                loadPadData(excalidrawAPI, padToActivate.id, padToActivate.data);
            }
        }
    }, [pads, isLoading, activePadId, excalidrawAPI]);

    const handleCreateNewPad = async () => {
        if (isCreatingPad) return; // Prevent multiple clicks
        
        try {
            setIsCreatingPad(true);
            
            // Create a new pad using the imported function
            const newPad = await createNewPad(excalidrawAPI, activePadId, saveCanvas);
            
            // Set the active pad ID in the component state
            setActivePadId(newPad.id);
        } catch (error) {
            console.error('Error creating new pad:', error);
        } finally {
            setIsCreatingPad(false);
        }
    };

    return (
        <>
            <div className="tabs-bar">
                <Stack.Col gap={2}>
                    <Section heading="canvasActions">
                        {!appState.viewModeEnabled && (
                            <div className="tabs-container">
                                {/* Loading indicator */}
                                {isLoading && (
                                    <div className="loading-indicator">
                                        Loading pads...
                                    </div>
                                )}
                                
                                {/* List all pads */}
                                {!isLoading && pads && pads.map((pad) => (
                                    <div 
                                        key={pad.id}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            setContextMenu({
                                                visible: true,
                                                x: e.clientX,
                                                y: e.clientY,
                                                padId: pad.id,
                                                padName: pad.display_name
                                            });
                                        }}
                                    >
                                        <Tooltip label={pad.display_name} children={
                                            <Button
                                                onSelect={() => handlePadSelect(pad)}
                                                children={pad.display_name}
                                                className={activePadId === pad.id ? "active-pad" : ""}
                                            />
                                        } />
                                    </div>
                                ))}
                                
                                {/* New pad button */}
                                <div className="new-tab-button-container">
                                    <Tooltip label={isCreatingPad ? "Creating new pad..." : "New pad"} children={
                                        <Button
                                            onSelect={isCreatingPad ? () => {} : handleCreateNewPad}
                                            className={isCreatingPad ? "creating-pad" : ""}
                                            children={
                                                <div className="ToolIcon__icon">
                                                    <FilePlus2 />
                                                </div>
                                            }
                                        />
                                    } />
                                </div>
                            </div>
                        )}
                    </Section>
                </Stack.Col>
            </div>
            
            {/* Context Menu */}
            {contextMenu.visible && (
                <TabContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    padId={contextMenu.padId}
                    padName={contextMenu.padName}
                    onRename={(padId, newName) => {
                        // Call the renamePad mutation
                        renamePad({ padId, newName });
                    }}
                    onDelete={(padId) => {
                        // Don't allow deleting the last pad
                        if (pads && pads.length <= 1) {
                            alert("Cannot delete the last pad");
                            return;
                        }
                        
                        // If deleting the active pad, switch to another pad first
                        if (padId === activePadId && pads) {
                            // Find another pad to activate
                            const otherPad = pads.find(p => p.id !== padId);
                            if (otherPad) {
                                // Set the new active pad
                                handlePadSelect(otherPad);
                            }
                        }
                        
                        // Call the deletePad mutation
                        deletePad(padId);
                    }}
                    onClose={() => {
                        setContextMenu(prev => ({ ...prev, visible: false }));
                    }}
                />
            )}
        </>
    );
};

export default Tabs;
