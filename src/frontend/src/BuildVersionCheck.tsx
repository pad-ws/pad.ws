import { useEffect, useState, useCallback } from 'react';
import { useBuildInfo, useSaveCanvas } from './api/hooks';
import { saveCurrentCanvas } from './utils/canvasUtils';

/**
 * Component that checks for application version changes and refreshes the page when needed.
 * This component doesn't render anything visible.
 */
export function BuildVersionCheck() {
  // Store the initial build hash when the component first loads
  const [initialBuildHash, setInitialBuildHash] = useState<string | null>(null);
  
  // Query for the current build info from the server
  const { data: buildInfo } = useBuildInfo();
  
  // Get the saveCanvas mutation
  const { mutate: saveCanvas } = useSaveCanvas({
    onSuccess: () => {
      console.debug("[pad.ws] Canvas saved before refresh");
      // Refresh the page immediately after saving
      window.location.reload();
    },
    onError: (error) => {
      console.error("[pad.ws] Failed to save canvas before refresh:", error);
      // Refresh anyway even if save fails
      window.location.reload();
    }
  });
  
  // Function to handle version update
  const handleVersionUpdate = useCallback(() => {
    // Save the canvas and then refresh
    saveCurrentCanvas(
      saveCanvas,
      undefined, // No success callback needed as it's handled in the useSaveCanvas hook
      () => window.location.reload() // On error, just refresh
    );
  }, [saveCanvas]);
  
  useEffect(() => {
    // On first load, store the initial build hash
    if (buildInfo?.buildHash && initialBuildHash === null) {
      console.log('Initial build hash:', buildInfo.buildHash);
      setInitialBuildHash(buildInfo.buildHash);
    }
    
    // If we have both values and they don't match, a new version is available
    if (initialBuildHash !== null && 
        buildInfo?.buildHash && 
        initialBuildHash !== buildInfo.buildHash) {
      
      console.log('New version detected. Current:', initialBuildHash, 'New:', buildInfo.buildHash);
      
      // Save the canvas and then refresh
      handleVersionUpdate();
    }
  }, [buildInfo, initialBuildHash, handleVersionUpdate]);
  
  // This component doesn't render anything
  return null;
}
