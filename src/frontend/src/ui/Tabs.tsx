import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";

import type { ExcalidrawImperativeAPI } from "@atyrode/excalidraw/types";
import { Stack, Button, Section, Tooltip } from "@atyrode/excalidraw";
import { FilePlus2, ChevronLeft, ChevronRight } from "lucide-react";
import { useAllPads, useSaveCanvas, useRenamePad, useDeletePad, PadData } from "../api/hooks";
import { queryClient } from "../api/queryClient";
import { 
  getPadData, 
  storePadData, 
  setActivePad, 
  getStoredActivePad,
  loadPadData,
  saveCurrentPadBeforeSwitching,
  createNewPad,
  setScrollIndex,
  getStoredScrollIndex
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
    const [startPadIndex, setStartPadIndex] = useState(getStoredScrollIndex());
    const PADS_PER_PAGE = 5; // Show 5 pads at a time
    
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
                
                // Recompute the startPadIndex to avoid visual artifacts
                // If deleting a pad would result in an empty space at the end of the tab bar
                if (startPadIndex > 0 && startPadIndex + PADS_PER_PAGE > updatedPads.length) {
                    // Calculate the new index that ensures the tab bar is filled properly
                    // but never goes below 0
                    const newIndex = Math.max(0, updatedPads.length - PADS_PER_PAGE);
                    setStartPadIndex(newIndex);
                    setScrollIndex(newIndex);
                }
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
            
            // Get the current pads from the query cache
            const currentPads = queryClient.getQueryData<PadData[]>(['allPads']);
            
            if (currentPads) {
                // Find the index of the newly created pad
                const newPadIndex = currentPads.findIndex(pad => pad.id === newPad.id);
                
                if (newPadIndex !== -1) {
                    // Calculate the appropriate startPadIndex to ensure the new pad is visible
                    // We want to position the view so that the new pad is visible
                    // Ideally, we want the new pad to be the last visible pad in the view
                    const newStartIndex = Math.max(0, Math.min(newPadIndex - PADS_PER_PAGE + 1, currentPads.length - PADS_PER_PAGE));
                    
                    // Update both the component state and the stored value
                    setStartPadIndex(newStartIndex);
                    setScrollIndex(newStartIndex);
                }
            }
        } catch (error) {
            console.error('Error creating new pad:', error);
        } finally {
            setIsCreatingPad(false);
        }
    };

    // Navigation functions - move by 1 pad at a time
    const showPreviousPads = () => {
        const newIndex = Math.max(0, startPadIndex - 1);
        setStartPadIndex(newIndex);
        setScrollIndex(newIndex);
    };

    const showNextPads = () => {
        if (pads) {
            const newIndex = Math.min(startPadIndex + 1, Math.max(0, pads.length - PADS_PER_PAGE));
            setStartPadIndex(newIndex);
            setScrollIndex(newIndex);
        }
    };

    // Create a dependency that only changes when the number of pads changes or pad IDs change
    const padStructure = React.useMemo(() => {
        return pads ? pads.map(pad => pad.id) : [];
    }, [pads]);

    // We've removed the auto-centering feature that would automatically position the active pad in the middle of the tab bar
    
    // Create a ref for the tabs wrapper to handle wheel events
    const tabsWrapperRef = useRef<HTMLDivElement>(null);
    
    // Track last wheel event time to throttle scrolling
    const lastWheelTimeRef = useRef<number>(0);
    const wheelThrottleMs = 70; // Minimum time between wheel actions in milliseconds
    
    // Set up wheel event listener with passive: false to properly prevent default behavior
    useLayoutEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            // Always prevent default to stop page navigation
            e.preventDefault();
            e.stopPropagation();
            
            // Throttle wheel events to prevent too rapid scrolling
            const now = Date.now();
            if (now - lastWheelTimeRef.current < wheelThrottleMs) {
                return;
            }
            
            // Update last wheel time
            lastWheelTimeRef.current = now;
            
            // Prioritize horizontal scrolling (deltaX) if present
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                // Horizontal scrolling
                if (e.deltaX > 0 && pads && startPadIndex < pads.length - PADS_PER_PAGE) {
                    showNextPads();
                } else if (e.deltaX < 0 && startPadIndex > 0) {
                    showPreviousPads();
                }
            } else {
                // Vertical scrolling - treat down as right, up as left (common convention)
                if (e.deltaY > 0 && pads && startPadIndex < pads.length - PADS_PER_PAGE) {
                    showNextPads();
                } else if (e.deltaY < 0 && startPadIndex > 0) {
                    showPreviousPads();
                }
            }
        };
        
        const tabsWrapper = tabsWrapperRef.current;
        if (tabsWrapper) {
            // Add wheel event listener with passive: false option
            tabsWrapper.addEventListener('wheel', handleWheel, { passive: false });
            
            // Clean up the event listener when component unmounts
            return () => {
                tabsWrapper.removeEventListener('wheel', handleWheel);
            };
        }
    }, [pads, startPadIndex, PADS_PER_PAGE]);  // Dependencies needed for boundary checks

    return (
        <>
            <div className="tabs-bar">
                <Stack.Col gap={2}>
                    <Section heading="canvasActions">
                        {!appState.viewModeEnabled && (
                            <>
                                <div 
                                    className="tabs-wrapper"
                                    ref={tabsWrapperRef}
                                >
                                    {/* New pad button - moved to the beginning */}
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
                                    
                                    <div className="tabs-container">
                                    {/* Loading indicator */}
                                    {isLoading && (
                                        <div className="loading-indicator">
                                            Loading pads...
                                        </div>
                                    )}
                                
                                    {/* List visible pads (5 at a time) */}
                                    {!isLoading && pads && pads.slice(startPadIndex, startPadIndex + PADS_PER_PAGE).map((pad) => (
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
                                        {/* Only show tooltip if name is likely to be truncated (more than ~15 characters) */}
                                        {pad.display_name.length > 11 ? (
                                            <Tooltip label={pad.display_name} children={
                                                <Button
                                                    onSelect={() => handlePadSelect(pad)}
                                                    className={activePadId === pad.id ? "active-pad" : ""}
                                                    children={
                                                        <div className="tab-content">
                                                            {pad.display_name.length > 8 ? `${pad.display_name.substring(0, 11)}...` : pad.display_name}
                                                            <span className="tab-position">{startPadIndex + pads.slice(startPadIndex, startPadIndex + PADS_PER_PAGE).indexOf(pad) + 1}</span>
                                                        </div>
                                                    }
                                                />
                                            } />
                                        ) : (
                                            <Button
                                                onSelect={() => handlePadSelect(pad)}
                                                className={activePadId === pad.id ? "active-pad" : ""}
                                                children={
                                                    <div className="tab-content">
                                                        {pad.display_name}
                                                        <span className="tab-position">{startPadIndex + pads.slice(startPadIndex, startPadIndex + PADS_PER_PAGE).indexOf(pad) + 1}</span>
                                                    </div>
                                                }
                                            />
                                        )}
                                    </div>
                                    ))}
                                    
                                    </div>
                                                                        
                                    {/* Left scroll button - only visible when there are more pads than can fit in the view */}
                                    {pads && pads.length > PADS_PER_PAGE && (
                                        <React.Fragment key={`left-tooltip-${startPadIndex}`}>
                                            <Tooltip 
                                                label={`Scroll to the left${startPadIndex > 0 ? `\n(${startPadIndex} more)` : ''}`} 
                                                children={
                                                    <button 
                                                        className={`scroll-button left ${startPadIndex > 0 ? '' : 'disabled'}`}
                                                        onClick={showPreviousPads}
                                                        aria-label="Show previous pads"
                                                        disabled={startPadIndex <= 0}
                                                    >
                                                        <ChevronLeft size={20} />
                                                    </button>
                                                } 
                                            />
                                        </React.Fragment>
                                    )}
                                    
                                    {/* Right scroll button - only visible when there are more pads than can fit in the view */}
                                    {pads && pads.length > PADS_PER_PAGE && (
                                        <React.Fragment key={`right-tooltip-${startPadIndex}`}>
                                            <Tooltip 
                                                label={`Scroll to the right${pads && pads.length - (startPadIndex + PADS_PER_PAGE) > 0 ? `\n(${Math.max(0, pads.length - (startPadIndex + PADS_PER_PAGE))} more)` : ''}`} 
                                                children={
                                                    <button 
                                                        className={`scroll-button right ${pads && startPadIndex < pads.length - PADS_PER_PAGE ? '' : 'disabled'}`}
                                                        onClick={showNextPads}
                                                        aria-label="Show next pads"
                                                        disabled={!pads || startPadIndex >= pads.length - PADS_PER_PAGE}
                                                    >
                                                        <ChevronRight size={20} />
                                                    </button>
                                                } 
                                            />
                                        </React.Fragment>
                                    )}
                                </div>
                            </>
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
