import React, { useState } from 'react';

import type { ExcalidrawImperativeAPI } from '@atyrode/excalidraw/types';
import type { MainMenu as MainMenuType } from '@atyrode/excalidraw';

import { LogOut, SquarePlus, LayoutDashboard, SquareCode, Eye, Coffee, Grid2x2, User, Text, ArchiveRestore } from 'lucide-react';
import { capture } from '../utils/posthog';
import { ExcalidrawElementFactory, PlacementMode } from '../lib/ExcalidrawElementFactory';
import { useUserProfile } from "../api/hooks";
import { queryClient } from "../api/queryClient";
import "./MainMenu.scss";
interface MainMenuConfigProps {
  MainMenu: typeof MainMenuType;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  showBackupsModal: boolean;
  setShowBackupsModal: (show: boolean) => void;
}

export const MainMenuConfig: React.FC<MainMenuConfigProps> = ({
  MainMenu,
  excalidrawAPI,
  showBackupsModal,
  setShowBackupsModal,
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
      link: "!html",
      width: 800,
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
      width: 360,
      height: 360
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
  
  const handleEditorClick = () => {
    if (!excalidrawAPI) return;
    
    const editorElement = ExcalidrawElementFactory.createEmbeddableElement({
      link: "!editor",
      width: 800,
      height: 500
    });
    
    ExcalidrawElementFactory.placeInScene(editorElement, excalidrawAPI, {
      mode: PlacementMode.NEAR_VIEWPORT_CENTER,
      bufferPercentage: 10,
      scrollToView: true
    });
  };

  const handleCanvasBackupsClick = () => {
    setShowBackupsModal(true);
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
      <div className="main-menu__top-row">
        <span className="main-menu__label">
          <User width={20} height={20} />
          <span className="main-menu__label-username">{username}</span>
        </span>
      </div>
      <MainMenu.Separator />

      <MainMenu.Group title="Files">
        <MainMenu.DefaultItems.LoadScene />
        <MainMenu.DefaultItems.Export />
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.Item
          icon={<ArchiveRestore />}
          onClick={handleCanvasBackupsClick}
        >
          Load backup...
        </MainMenu.Item>
        <MainMenu.DefaultItems.ClearCanvas />
      </MainMenu.Group>
      
      <MainMenu.Separator />
    
      <MainMenu.Group title="Tools">
        <MainMenu.Item
          icon={<SquareCode />}
          onClick={handleHtmlEditorClick}
        >
          HTML Editor
        </MainMenu.Item>
        <MainMenu.Item
          icon={<Text />}
          onClick={handleEditorClick}
        >
          Code Editor
        </MainMenu.Item>
        <MainMenu.Item
          icon={<LayoutDashboard />}
          onClick={handleDashboardButtonClick}
        >
          Dashboard
        </MainMenu.Item>
        <MainMenu.Item
          icon={<SquarePlus />}
          onClick={handleInsertButtonClick}
        >
          Action Button
        </MainMenu.Item>
      </MainMenu.Group>

      <MainMenu.Separator />
      
      <MainMenu.Group title="View">
        <MainMenu.Item
          icon={<Grid2x2 />}
          onClick={handleGridToggle}
        >
         Toggle grid
        </MainMenu.Item>
        <MainMenu.Item
          icon={<Eye />}
          onClick={handleViewModeToggle}
        >
          View mode
        </MainMenu.Item>
        <MainMenu.Item
          icon={<Coffee />}
          onClick={handleZenModeToggle}
        >
          Zen mode
        </MainMenu.Item>

      </MainMenu.Group>
      
      <MainMenu.Separator />
      
      <MainMenu.Item
          icon={<LogOut />}
          onClick={async () => {
            capture('logout_clicked');
            
            try {
              // Call the logout endpoint but don't follow the redirect
              await fetch('/auth/logout', { 
                method: 'GET',
                credentials: 'include' 
              });
              
              // Clear the session_id cookie client-side
              document.cookie = "session_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
              
              // Invalidate auth query to show the AuthModal
              queryClient.invalidateQueries({ queryKey: ['auth'] });
              queryClient.invalidateQueries({ queryKey: ['userProfile'] });
              
              console.log("Logged out successfully");
            } catch (error) {
              console.error("Logout failed:", error);
            }
          }}
        >
          Logout
        </MainMenu.Item>
      
    </MainMenu>
  );
};
