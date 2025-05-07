import React, { useState } from 'react';

import type { ExcalidrawImperativeAPI } from '@atyrode/excalidraw/types';
import type { MainMenu as MainMenuType } from '@atyrode/excalidraw';

import { LogOut, SquarePlus, LayoutDashboard, SquareCode, Eye, Coffee, Grid2x2, User, Text, ArchiveRestore, Settings, Terminal, FileText } from 'lucide-react';
import AccountDialog from './AccountDialog';
import md5 from 'crypto-js/md5';
import { capture } from '../utils/posthog';
import { ExcalidrawElementFactory, PlacementMode } from '../lib/ExcalidrawElementFactory';
import { useUserProfile } from "../api/hooks";
import { queryClient } from "../api/queryClient";
import "./MainMenu.scss";

// Function to generate gravatar URL
const getGravatarUrl = (email: string, size = 32) => {
  const hash = md5(email.toLowerCase().trim()).toString();
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
};
interface MainMenuConfigProps {
  MainMenu: typeof MainMenuType;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  showBackupsModal: boolean;
  setShowBackupsModal: (show: boolean) => void;
  showPadsModal: boolean;
  setShowPadsModal: (show: boolean) => void;
  showSettingsModal?: boolean;
  setShowSettingsModal?: (show: boolean) => void;
}

export const MainMenuConfig: React.FC<MainMenuConfigProps> = ({
  MainMenu,
  excalidrawAPI,
  setShowBackupsModal,
  setShowPadsModal,
  setShowSettingsModal = (show: boolean) => {},
}) => {
  const [showAccountModal, setShowAccountModal] = useState(false);
  const { data, isLoading, isError } = useUserProfile();

  let username = "";
  let email = "";
  if (isLoading) {
    username = "Loading...";
  } else if (isError || !data?.username) {
    username = "Unknown";
  } else {
    username = data.username;
    email = data.email || "";
  }

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
  
  const handleTerminalClick = () => {
    if (!excalidrawAPI) return;
    
    const terminalElement = ExcalidrawElementFactory.createEmbeddableElement({
      link: "!terminal",
      width: 800,
      height: 500
    });
    
    ExcalidrawElementFactory.placeInScene(terminalElement, excalidrawAPI, {
      mode: PlacementMode.NEAR_VIEWPORT_CENTER,
      bufferPercentage: 10,
      scrollToView: true
    });
  };

  const handleCanvasBackupsClick = () => {
    setShowBackupsModal(true);
  };
  
  const handleManagePadsClick = () => {
    setShowPadsModal(true);
  };

  const handleSettingsClick = () => {
    setShowSettingsModal(true);
  };
  
  const handleAccountClick = () => {
    setShowAccountModal(true);
  };

  const handleLogout = async () => {
    capture('logout_clicked');
    
    try {
      // Call the logout endpoint and get the logout_url
      const response = await fetch('/auth/logout', { 
        method: 'GET',
        credentials: 'include' 
      });
      const data = await response.json();
      const keycloakLogoutUrl = data.logout_url;
      
      // Create a function to create an iframe and return a promise that resolves when it loads or times out
      const createIframeLoader = (url: string, debugName: string): Promise<void> => {
        return new Promise<void>((resolve) => {
          const iframe = document.createElement("iframe");
          iframe.style.display = "none";
          iframe.src = url;
          console.debug(`[pad.ws] (Silently) Priming ${debugName} logout for ${url}`);

          const cleanup = () => {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            resolve();
          };

          iframe.onload = cleanup;
          // Fallback: remove iframe after 2s if onload doesn't fire
          const timeoutId = window.setTimeout(cleanup, 2000);

          // Also clean up if the iframe errors
          iframe.onerror = () => {
            clearTimeout(timeoutId);
            cleanup();
          };

          // Add the iframe to the DOM
          document.body.appendChild(iframe);
        });
      };

      // Create a promise for Keycloak logout iframe
      const promises = [];

      // Add Keycloak logout iframe
      promises.push(createIframeLoader(keycloakLogoutUrl, "Keycloak"));

      // Wait for both iframes to complete
      await Promise.all(promises);

      // Wait for the iframe to complete
      await Promise.all(promises);
            
      // Invalidate auth query to show the AuthModal
      queryClient.invalidateQueries({ queryKey: ['auth'] });
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      
      // No need to redirect to the logout URL since we're already handling it via iframe
      console.debug("[pad.ws] Logged out successfully");
    } catch (error) {
      console.error("[pad.ws] Logout failed:", error);
    }
  };

  return (
    <>
      {showAccountModal && (
        <AccountDialog 
          excalidrawAPI={excalidrawAPI} 
          onClose={() => setShowAccountModal(false)} 
        />
      )}
      <MainMenu>
        <div className="main-menu__top-row">
          <span className="main-menu__label" style={{ gap: 0.2 }}>
            {email && (
              <img 
                src={getGravatarUrl(email)} 
                alt={username} 
                className="main-menu__gravatar" 
                width={20} 
                height={20} 
                style={{ borderRadius: '50%', marginRight: '8px' }}
              />
            )}
            <span className="main-menu__label-username">{username}</span>
          </span>
        </div>
      <MainMenu.Separator />

      <MainMenu.Group title="Files">
        <MainMenu.DefaultItems.LoadScene />
        <MainMenu.DefaultItems.Export />
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.Item
          icon={<FileText />}
          onClick={handleManagePadsClick}
        >
          Manage pads...
        </MainMenu.Item>
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
          icon={<Text />}
          onClick={handleEditorClick}
        >
          Code Editor
        </MainMenu.Item>
        <MainMenu.Item
          icon={<Terminal />}
          onClick={handleTerminalClick}
        >
          Terminal
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
      
      <MainMenu.Item
          icon={<User />}
          onClick={handleAccountClick}
        >
          Account
        </MainMenu.Item>
      
      <MainMenu.Item
          icon={<Settings />}
          onClick={handleSettingsClick}
        >
          Settings
        </MainMenu.Item>
      
      <MainMenu.Item
          icon={<LogOut />}
          onClick={handleLogout}
        >
          Logout
        </MainMenu.Item>
      
    </MainMenu>
    </>
  );
};
