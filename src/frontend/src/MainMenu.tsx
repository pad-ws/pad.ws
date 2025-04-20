import React from 'react';

import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { MainMenu as MainMenuType } from '@excalidraw/excalidraw';

import { LogOut, SquarePlus, LayoutDashboard, SquareCode, Eye, Coffee, Grid2x2, User } from 'lucide-react';
import { capture } from './utils/posthog';
import { ExcalidrawElementFactory, PlacementMode } from './lib/ExcalidrawElementFactory';
import { useUserProfile } from "./api/hooks";

interface MainMenuConfigProps {
  MainMenu: typeof MainMenuType;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}

export const MainMenuConfig: React.FC<MainMenuConfigProps> = ({
  MainMenu,
  excalidrawAPI,
}) => {
  const { data, isLoading, isError } = useUserProfile();

  let username = "";
  if (isLoading) {
    username = "Loading...";
  } else if (isError || !data?.username) {
    username = "Unknown";
  } else {
    username = data.username;
  }
  const handleHtmlEditorClick = () => {
    if (!excalidrawAPI) return;
    
    const htmlEditorElement = ExcalidrawElementFactory.createEmbeddableElement({
      link: "!editor",
      width: 1200,
      height: 500
    });
    
    ExcalidrawElementFactory.placeInScene(htmlEditorElement, excalidrawAPI, {
      mode: PlacementMode.NEAR_VIEWPORT_CENTER,
      bufferPercentage: 10,
      scrollToView: true
    });
  };

  const handleDashboardButtonClick = () => {
    if (!excalidrawAPI) return;
    
    const dashboardElement = ExcalidrawElementFactory.createEmbeddableElement({
      link: "!dashboard",
      width: 460,
      height: 80
    });
    
    ExcalidrawElementFactory.placeInScene(dashboardElement, excalidrawAPI, {
      mode: PlacementMode.NEAR_VIEWPORT_CENTER,
      bufferPercentage: 10,
      scrollToView: true
    });
  };

  const handleInsertButtonClick = () => {
    if (!excalidrawAPI) return;
    
    const buttonElement = ExcalidrawElementFactory.createEmbeddableElement({
      link: "!button",
      width: 460,
      height: 80
    });
    
    ExcalidrawElementFactory.placeInScene(buttonElement, excalidrawAPI, {
      mode: PlacementMode.NEAR_VIEWPORT_CENTER,
      bufferPercentage: 10,
      scrollToView: true
    });
  };

  const handleGridToggle = () => {
    if (!excalidrawAPI) return;
    const appState = excalidrawAPI.getAppState();
    appState.gridModeEnabled = !appState.gridModeEnabled;
    appState.gridSize = 20;
    appState.gridStep = 5;
    excalidrawAPI.updateScene({
      appState: appState
    });
  };

  const handleZenModeToggle = () => {
    if (!excalidrawAPI) return;
    const appState = excalidrawAPI.getAppState();
    appState.zenModeEnabled = !appState.zenModeEnabled;
    excalidrawAPI.updateScene({
      appState: appState
    });
  };

  const handleViewModeToggle = () => {
    if (!excalidrawAPI) return;
    const appState = excalidrawAPI.getAppState();
    appState.viewModeEnabled = !appState.viewModeEnabled;
    excalidrawAPI.updateScene({
      appState: appState
    });
  };

  return (
    <MainMenu>
      <div className="main-menu-top-row">
        <span className="main-menu-label">
          <User width={20} height={20} />
          <span>{username}</span>
        </span>
      </div>
      <MainMenu.Separator />

      <MainMenu.Group title="Files">
        <MainMenu.DefaultItems.LoadScene />
        <MainMenu.DefaultItems.Export />
        <MainMenu.DefaultItems.SaveAsImage />
      </MainMenu.Group>
      
      <MainMenu.Separator />
      
      <MainMenu.Group title="Canvas">
        <MainMenu.Item
          icon={<Grid2x2 />}
          onClick={handleGridToggle}
        >
         Toggle Grid
        </MainMenu.Item>
        <MainMenu.Item
          icon={<Eye />}
          onClick={handleViewModeToggle}
        >
          View Mode
        </MainMenu.Item>
        <MainMenu.Item
          icon={<Coffee />}
          onClick={handleZenModeToggle}
        >
          Zen Mode
        </MainMenu.Item>
        <MainMenu.DefaultItems.ClearCanvas />
      </MainMenu.Group>
      
      <MainMenu.Separator />
      
      <MainMenu.Group title="Tools">
        <MainMenu.Item
          icon={<SquareCode />}
          onClick={handleHtmlEditorClick}
        >
          Insert HTML Editor
        </MainMenu.Item>
        <MainMenu.Item
          icon={<LayoutDashboard />}
          onClick={handleDashboardButtonClick}
        >
          Insert Dashboard
        </MainMenu.Item>
        <MainMenu.Item
          icon={<SquarePlus />}
          onClick={handleInsertButtonClick}
        >
          Insert Button
        </MainMenu.Item>
      </MainMenu.Group>

      <MainMenu.Separator />

      <MainMenu.Item
          icon={<LogOut />}
          onClick={() => {
            capture('logout_clicked');
            window.location.href = "/auth/logout";
          }}
        >
          Logout
        </MainMenu.Item>
      
    </MainMenu>
  );
};
