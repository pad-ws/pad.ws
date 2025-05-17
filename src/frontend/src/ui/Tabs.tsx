import React, { useState, useEffect, useRef, useLayoutEffect } from "react";

import type { ExcalidrawImperativeAPI } from "@atyrode/excalidraw/types";
import { Stack, Button, Section, Tooltip } from "@atyrode/excalidraw";
import { FilePlus2, ChevronLeft, ChevronRight } from "lucide-react";

// Removed: import { usePadTabs } from "../hooks/usePadTabs";
import { usePad } from "../hooks/usePadData"; // Keep usePad for isPadLoading and padError
import { capture } from "../lib/posthog";
import TabContextMenu from "./TabContextMenu";
import "./Tabs.scss";

// Define PadTab type if not already globally available or imported from usePadTabs
interface PadTab {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
}

interface TabsProps {
  excalidrawAPI: ExcalidrawImperativeAPI;
  tabs: PadTab[];
  selectedTabId: string | null; // Can be null if no tab is selected
  isLoading: boolean; // Loading state for the tab list
  isCreatingPad: boolean;
  createNewPadAsync: () => Promise<PadTab | null | undefined>; // Adjusted based on usePadTabs return
  renamePad: (args: { padId: string; newName: string }) => void;
  deletePad: (padId: string) => void;
  selectTab: (tabId: string) => void;
}

const Tabs: React.FC<TabsProps> = ({
  excalidrawAPI,
  tabs,
  selectedTabId,
  isLoading,
  isCreatingPad,
  createNewPadAsync,
  renamePad,
  deletePad,
  selectTab,
}) => {
    // Use the usePad hook to handle loading pad data when selectedTabId changes
    // Note: selectedTabId comes from props now
    const { isLoading: isPadLoading, error: padError } = usePad(selectedTabId, excalidrawAPI);

    const appState = excalidrawAPI.getAppState();
    const [startPadIndex, setStartPadIndex] = useState(0);
    const PADS_PER_PAGE = 5;

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

    const handlePadSelect = (pad: PadTab) => {
        selectTab(pad.id);
    };

    const handleCreateNewPad = async () => {
        if (isCreatingPad) return;
        
        try {
            const newPad = await createNewPadAsync();
            
            if (newPad) {
                capture("pad_created", {
                    padId: newPad.id,
                    padName: newPad.title
                });
                
                // Scroll to the new tab if it's off-screen
                // The `tabs` list will be updated by react-query. Need to wait for that update.
                // This logic might need to be in a useEffect that watches `tabs` and `selectedTabId`.
                // For now, we assume `usePadTabs` handles selection, and scrolling might need adjustment.
                const newPadIndex = tabs.findIndex(tab => tab.id === newPad.id); // This will be based on PREVIOUS tabs list
                if (newPadIndex !== -1) { // This check might be problematic due to timing
                    const newStartIndex = Math.max(0, Math.min(newPadIndex - PADS_PER_PAGE + 1, tabs.length - PADS_PER_PAGE));
                    setStartPadIndex(newStartIndex);
                } else {
                    // If newPad is not in current `tabs` (due to async update), try to scroll to end
                    if (tabs.length >= PADS_PER_PAGE) {
                         setStartPadIndex(Math.max(0, tabs.length + 1 - PADS_PER_PAGE));
                    }
                }
            }
        } catch (error) {
            console.error('Error creating new pad:', error);
        }
    };

    // Adjust scrolling logic when tabs array changes (e.g. after delete)
    useEffect(() => {
        if (tabs && startPadIndex > 0 && startPadIndex + PADS_PER_PAGE > tabs.length) {
            const newIndex = Math.max(0, tabs.length - PADS_PER_PAGE);
            setStartPadIndex(newIndex);
        }
    }, [tabs, startPadIndex, PADS_PER_PAGE]);


    const showPreviousPads = () => {
        const newIndex = Math.max(0, startPadIndex - 1);
        setStartPadIndex(newIndex);
    };

    const showNextPads = () => {
        if (tabs) {
            const newIndex = Math.min(startPadIndex + 1, Math.max(0, tabs.length - PADS_PER_PAGE));
            setStartPadIndex(newIndex);
        }
    };

    const tabsWrapperRef = useRef<HTMLDivElement>(null);
    const lastWheelTimeRef = useRef<number>(0);
    const wheelThrottleMs = 70;
    
    useLayoutEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            e.stopPropagation();
            
            const now = Date.now();
            if (now - lastWheelTimeRef.current < wheelThrottleMs) {
                return;
            }
            lastWheelTimeRef.current = now;
            
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                if (e.deltaX > 0 && tabs && startPadIndex < tabs.length - PADS_PER_PAGE) {
                    showNextPads();
                } else if (e.deltaX < 0 && startPadIndex > 0) {
                    showPreviousPads();
                }
            } else {
                if (e.deltaY > 0 && tabs && startPadIndex < tabs.length - PADS_PER_PAGE) {
                    showNextPads();
                } else if (e.deltaY < 0 && startPadIndex > 0) {
                    showPreviousPads();
                }
            }
        };
        
        const localTabsWrapperRef = tabsWrapperRef.current;
        if (localTabsWrapperRef) {
            localTabsWrapperRef.addEventListener('wheel', handleWheel, { passive: false });
            return () => {
                localTabsWrapperRef.removeEventListener('wheel', handleWheel);
            };
        }
    }, [tabs, startPadIndex, PADS_PER_PAGE, showNextPads, showPreviousPads]);

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
                                    {isLoading && !isPadLoading && (
                                        <div className="loading-indicator">
                                            Loading pads...
                                        </div>
                                    )}
                                    {isPadLoading && (
                                        <div className="loading-indicator">
                                            Loading pad content...
                                        </div>
                                    )}
                                
                                    {!isLoading && !isPadLoading && tabs && tabs.slice(startPadIndex, startPadIndex + PADS_PER_PAGE).map((tab, index) => (
                                    <div 
                                        key={tab.id}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            setContextMenu({
                                                visible: true,
                                                x: e.clientX,
                                                y: e.clientY,
                                                padId: tab.id,
                                                padName: tab.title
                                            });
                                        }}
                                    >
                                        {(selectedTabId === tab.id || tab.title.length > 11) ? (
                                            <Tooltip 
                                                label={
                                                    selectedTabId === tab.id 
                                                        ? (tab.title.length > 11 
                                                            ? `${tab.title} (current pad)` 
                                                            : "Current pad")
                                                        : tab.title
                                                } 
                                                children={
                                                    <Button
                                                        onSelect={() => handlePadSelect(tab)}
                                                        className={selectedTabId === tab.id ? "active-pad" : ""}
                                                        children={
                                                            <div className="tab-content">
                                                                {tab.title.length > 8 ? `${tab.title.substring(0, 11)}...` : tab.title}
                                                                {/* Calculate position based on overall index in `tabs` if needed, or `startPadIndex + index + 1` */}
                                                                <span className="tab-position">{tabs.findIndex(t => t.id === tab.id) + 1}</span>
                                                            </div>
                                                        }
                                                    />
                                                } 
                                            />
                                        ) : (
                                            <Button
                                                onSelect={() => handlePadSelect(tab)}
                                                className={selectedTabId === tab.id ? "active-pad" : ""}
                                                children={
                                                    <div className="tab-content">
                                                        {tab.title}
                                                        <span className="tab-position">{tabs.findIndex(t => t.id === tab.id) + 1}</span>
                                                    </div>
                                                }
                                            />
                                        )}
                                    </div>
                                    ))}
                                    
                                    </div>
                                                                        
                                    {tabs && tabs.length > PADS_PER_PAGE && (
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
                                    
                                    {tabs && tabs.length > PADS_PER_PAGE && (
                                        <React.Fragment key={`right-tooltip-${startPadIndex}`}>
                                            <Tooltip 
                                                label={`Scroll to the right${tabs && tabs.length - (startPadIndex + PADS_PER_PAGE) > 0 ? `\n(${Math.max(0, tabs.length - (startPadIndex + PADS_PER_PAGE))} more)` : ''}`} 
                                                children={
                                                    <button 
                                                        className={`scroll-button right ${tabs && startPadIndex < tabs.length - PADS_PER_PAGE ? '' : 'disabled'}`}
                                                        onClick={showNextPads}
                                                        aria-label="Show next pads"
                                                        disabled={!tabs || startPadIndex >= tabs.length - PADS_PER_PAGE}
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
            
            {contextMenu.visible && (
                <TabContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    padId={contextMenu.padId}
                    padName={contextMenu.padName}
                    onRename={(padId, newName) => {
                        capture("pad_renamed", { padId, newName });
                        renamePad({ padId, newName });
                    }}
                    onDelete={(padId) => {
                        if (tabs && tabs.length <= 1) {
                            alert("Cannot delete the last pad");
                            return;
                        }
                        
                        const tabToDelete = tabs?.find(t => t.id === padId);
                        const padName = tabToDelete?.title || "";
                        capture("pad_deleted", { padId, padName });
                        
                        if (padId === selectedTabId && tabs) {
                            const otherTab = tabs.find(t => t.id !== padId);
                            if (otherTab) {
                                // Before deleting, select another tab.
                                // The actual deletion will trigger a list update and selection adjustment in usePadTabs.
                                selectTab(otherTab.id); 
                                // It might be better to let usePadTabs handle selection after delete.
                                // For now, explicitly select, then delete.
                            }
                        }
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
