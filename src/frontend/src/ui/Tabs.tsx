import React, { useState, useEffect, useRef, useLayoutEffect } from "react";

import type { ExcalidrawImperativeAPI } from "@atyrode/excalidraw/types";
import { Stack, Button, Section, Tooltip } from "@atyrode/excalidraw";
import { FilePlus2, ChevronLeft, ChevronRight, Users } from "lucide-react";

import { usePad } from "../hooks/usePadData";
import { useAuthStatus } from "../hooks/useAuthStatus";
import type { Tab } from "../hooks/usePadTabs";
import { capture } from "../lib/posthog";
import TabContextMenu from "./TabContextMenu";
import "./Tabs.scss";

interface TabsProps {
    excalidrawAPI: ExcalidrawImperativeAPI;
    tabs: Tab[];
    selectedTabId: string | null;
    isLoading: boolean;
    isCreatingPad: boolean;
    createNewPadAsync: () => Promise<Tab | null | undefined>;
    renamePad: (args: { padId: string; newName: string }) => void;
    deletePad: (padId: string) => void;
    leaveSharedPad: (padId: string) => void; // Added prop
    updateSharingPolicy: (args: { padId: string; policy: string }) => void;
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
    leaveSharedPad, // Destructure new prop
    updateSharingPolicy,
    selectTab,
}) => {
    const { user: currentUser } = useAuthStatus();
    const { isLoading: isPadLoading, error: padError } = usePad(selectedTabId, excalidrawAPI);
    const [displayPadLoadingIndicator, setDisplayPadLoadingIndicator] = useState(false);

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

    const handlePadSelect = (pad: Tab) => {
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

                const newPadIndex = tabs.findIndex((tab: { id: any; }) => tab.id === newPad.id);
                if (newPadIndex !== -1) {
                    const newStartIndex = Math.max(0, Math.min(newPadIndex - PADS_PER_PAGE + 1, tabs.length - PADS_PER_PAGE));
                    setStartPadIndex(newStartIndex);
                } else {
                    if (tabs.length >= PADS_PER_PAGE) {
                        setStartPadIndex(Math.max(0, tabs.length + 1 - PADS_PER_PAGE));
                    }
                }
            }
        } catch (error) {
            console.error('Error creating new pad:', error);
        }
    };

    useEffect(() => {
        if (tabs && startPadIndex > 0 && startPadIndex + PADS_PER_PAGE > tabs.length) {
            const newIndex = Math.max(0, tabs.length - PADS_PER_PAGE);
            setStartPadIndex(newIndex);
        }
    }, [tabs, startPadIndex, PADS_PER_PAGE]);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (isPadLoading && selectedTabId) {
            if (!displayPadLoadingIndicator) {
                timer = setTimeout(() => {
                    if (isPadLoading) {
                        setDisplayPadLoadingIndicator(true);
                    }
                }, 200);
            }
        } else {
            setDisplayPadLoadingIndicator(false);
        }

        return () => {
            clearTimeout(timer);
        };
    }, [isPadLoading, selectedTabId, displayPadLoadingIndicator]);


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

    useEffect(() => {
        // Update SVG filter attributes based on CSS variables
        const publicTabElement = document.querySelector('.tab-sharing-public');
        if (publicTabElement) {
            const computedStyle = getComputedStyle(publicTabElement);

            const dilateRadius = computedStyle.getPropertyValue('--tab-glow-dilate-radius').trim();
            const blurStdDeviation = computedStyle.getPropertyValue('--tab-glow-blur-std-deviation').trim();
            const opacitySlope = computedStyle.getPropertyValue('--tab-glow-opacity-slope').trim();

            const filterGlow1 = document.getElementById('glow-1');
            if (filterGlow1) {
                const feMorphology = filterGlow1.querySelector('feMorphology');
                if (feMorphology) {
                    feMorphology.setAttribute('radius', dilateRadius);
                }

                const feGaussianBlur = filterGlow1.querySelector('feGaussianBlur[result="glow"]');
                if (feGaussianBlur) {
                    feGaussianBlur.setAttribute('stdDeviation', blurStdDeviation);
                }

                const feComponentTransfers = filterGlow1.querySelectorAll('feComponentTransfer');
                let targetFeFuncA: SVGFEFuncAElement | null = null;
                feComponentTransfers.forEach(feComp => {
                    if (feComp.getAttribute('in') !== 'SourceGraphic') {
                        const feFunc = feComp.querySelector('feFuncA[type="linear"]');
                        if (feFunc) {
                            targetFeFuncA = feFunc as SVGFEFuncAElement;
                        }
                    }
                });

                if (targetFeFuncA) {
                    targetFeFuncA.setAttribute('slope', opacitySlope);
                }
            }
        }
        // Rerun if tabs change, as a public tab might become visible/active
    }, [tabs, selectedTabId]);


    return (
        <>
            <svg width="0" height="0" aria-hidden="true" style={{ position: 'fixed', top: '-1px', left: '-1px' }}>
              <filter id="glow-0" x="-25%" y="-25%" width="150%" height="150%">
                <feComponentTransfer>
                  <feFuncA type="table" tableValues="0 2 0"/>
                </feComponentTransfer>
                <feGaussianBlur stdDeviation="2"/>
                <feComponentTransfer result="rond">
                  <feFuncA type="table" tableValues="-2 3"/>
                </feComponentTransfer>
                <feMorphology operator="dilate" radius="3"/>
                <feGaussianBlur stdDeviation="6"/>
                <feBlend in="rond" result="glow"/>
                <feComponentTransfer in="SourceGraphic">
                  <feFuncA type="table" tableValues="0 0 1"/>
                </feComponentTransfer>
                <feBlend in2="glow"/>
              </filter>
              
              <filter id="glow-1" x="-25%" y="-25%" width="150%" height="150%">
                <feComponentTransfer in="SourceGraphic" result="grad">
                  <feFuncA type="table" tableValues="0 2 0"/>
                </feComponentTransfer>
                <feMorphology operator="dilate" radius="3"/>
                <feGaussianBlur stdDeviation="6" result="glow"/>
                <feTurbulence type="fractalNoise" baseFrequency="7.13"/>
                <feDisplacementMap in="glow" scale="12" yChannelSelector="R"/>
                <feComponentTransfer>
                  <feFuncA type="linear" slope=".8"/>
                </feComponentTransfer>
                <feBlend in="grad" result="out"/>
                <feComponentTransfer in="SourceGraphic">
                  <feFuncA type="table" tableValues="0 0 1"/>
                </feComponentTransfer>
                <feBlend in2="out"/>
              </filter>
            </svg>
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
                                                onSelect={isCreatingPad ? () => { } : handleCreateNewPad}
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

                                        {!isLoading && tabs && tabs.slice(startPadIndex, startPadIndex + PADS_PER_PAGE).map((tab: Tab, index: any) => (
                                            <div
                                                key={tab.id}
                                                onContextMenu={(e: { preventDefault: () => void; clientX: any; clientY: any; }) => {
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
                                                                className={`tab-sharing-${tab.sharingPolicy} ${selectedTabId === tab.id ? "active-pad" : ""}`}
                                                                children={
                                                                    <div className="tab-content">
                                                                        {selectedTabId === tab.id && displayPadLoadingIndicator ? "..." : (tab.title.length > 8 ? `${tab.title.substring(0, 11)}...` : tab.title)}
                                                                        {/* Calculate position based on overall index in `tabs` if needed, or `startPadIndex + index + 1` */}
                                                                        {tab.sharingPolicy === "public" ? 
                                                                            <Users size={16} className="tab-position tab-users-icon" /> : 
                                                                            <span className="tab-position">{tabs.findIndex((t: { id: any; }) => t.id === tab.id) + 1}</span>
                                                                        }
                                                                    </div>
                                                                }
                                                            />
                                                        }
                                                    />
                                                ) : (
                                                    <Button
                                                        onSelect={() => handlePadSelect(tab)}
                                                        className={`tab-sharing-${tab.sharingPolicy} ${selectedTabId === tab.id ? "active-pad" : ""}`}
                                                        children={
                                                            <div className="tab-content">
                                                                {tab.title}
                                                                {tab.sharingPolicy === "public" ? 
                                                                    <Users size={16} className="tab-position tab-users-icon" /> : 
                                                                    <span className="tab-position">{tabs.findIndex((t: { id: any; }) => t.id === tab.id) + 1}</span>
                                                                }
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
                    sharingPolicy={tabs.find(tab => tab.id === contextMenu.padId)?.sharingPolicy}
                    currentUserId={currentUser?.id}
                    tabOwnerId={tabs.find(tab => tab.id === contextMenu.padId)?.ownerId}
                    onRename={(padId: any, newName: any) => {
                        capture("pad_renamed", { padId, newName });
                        renamePad({ padId, newName });
                    }}
                    onDelete={(padId: any) => { // This is for 'deleteOwnedPad'
                        if (tabs && tabs.length <= 1) {
                            alert("Cannot delete the last pad");
                            return;
                        }

                        const tabToDelete = tabs?.find((t: { id: any; }) => t.id === padId);
                        const padName = tabToDelete?.title || "";
                        capture("pad_deleted", { padId, padName });

                        if (padId === selectedTabId && tabs) {
                            const otherTab = tabs.find((t: { id: any; }) => t.id !== padId);
                            if (otherTab) {
                                selectTab(otherTab.id);
                            }
                        }
                        deletePad(padId); // Calls the prop for deleting owned pad
                    }}
                    onLeaveSharedPad={(padId: string) => { // New prop for 'leaveSharedPad'
                        leaveSharedPad(padId); // Calls the prop for leaving shared pad
                    }}
                    onUpdateSharingPolicy={(padId: string, policy: string) => {
                        capture("pad_sharing_policy_updated", { padId, policy });
                        updateSharingPolicy({ padId, policy });
                    }}
                    onClose={() => {
                        setContextMenu((prev: any) => ({ ...prev, visible: false }));
                    }}
                />
            )}
        </>
    );
};

export default Tabs;
