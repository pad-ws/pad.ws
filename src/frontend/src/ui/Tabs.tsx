import React from "react";

import type { ExcalidrawImperativeAPI } from "@atyrode/excalidraw/types";
import { Stack, Button, Section, Tooltip } from "@atyrode/excalidraw";
import { FilePlus2 } from "lucide-react";
import "./Tabs.scss";

interface TabsProps {
  excalidrawAPI: ExcalidrawImperativeAPI;
}

const Tabs: React.FC<TabsProps> = ({
  excalidrawAPI,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
}) => {

    const appState = excalidrawAPI.getAppState();
    return (
        <div className="tabs-bar">
            <Stack.Col gap={2}>
                <Section heading="canvasActions">
                    {!appState.viewModeEnabled && (
                        <div className="new-tab-button-container">
                            <Tooltip label="New pad" children={
                                <Button
                                    onSelect={() => {}}
                                    children={
                                        <div className="ToolIcon__icon">
                                            <FilePlus2 />
                                        </div>}
                                />
                            }>
                            </Tooltip>
                        </div>
                    )}
                </Section>
            </Stack.Col>
        </div>
  );
};

export default Tabs;