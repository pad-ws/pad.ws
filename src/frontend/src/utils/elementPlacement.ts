import type { 
  ExcalidrawElement
} from '@excalidraw/excalidraw/element/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';

// Enum for placement modes
export enum PlacementMode {
  NEAR_POINT, // Place near a specific point
  NEAR_VIEWPORT_CENTER // Place near the center of the viewport
}

/**
 * Checks if two rectangles overlap with a buffer space based on a percentage of each rectangle's size
 */
export function doRectanglesOverlap(
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number },
  bufferPercentage: number = 10
): boolean {
  // Calculate buffer based on percentage of element size
  const buffer1Width = (rect1.width * bufferPercentage) / 100;
  const buffer1Height = (rect1.height * bufferPercentage) / 100;
  const buffer2Width = (rect2.width * bufferPercentage) / 100;
  const buffer2Height = (rect2.height * bufferPercentage) / 100;
  
  // Use the larger of the two buffers for each dimension
  const bufferX = Math.max(buffer1Width, buffer2Width);
  const bufferY = Math.max(buffer1Height, buffer2Height);
  
  // Check if one rectangle is to the left of the other
  if (rect1.x + rect1.width + bufferX < rect2.x || rect2.x + rect2.width + bufferX < rect1.x) {
    return false;
  }
  
  // Check if one rectangle is above the other
  if (rect1.y + rect1.height + bufferY < rect2.y || rect2.y + rect2.height + bufferY < rect1.y) {
    return false;
  }
  
  // If neither of the above conditions is true, the rectangles overlap
  return true;
}

/**
 * Finds a position for an element that doesn't overlap with existing elements,
 * prioritizing positions closest to the original point
 */
export function findNonOverlappingPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  elements: readonly any[],
  bufferPercentage: number = 10
): { x: number; y: number } {
  const newRect = { x, y, width, height };
  
  // Filter valid elements that we need to check for overlaps
  const validElements = elements.filter(element => 
    !element.isDeleted && 
    typeof element.x === 'number' && 
    typeof element.y === 'number' && 
    typeof element.width === 'number' && 
    typeof element.height === 'number'
  );
  
  // Check if the proposed position overlaps with any existing elements
  const hasOverlap = validElements.some(element => 
    doRectanglesOverlap(newRect, element, bufferPercentage)
  );
  
  if (!hasOverlap) {
    return { x, y }; // Original position is good, use it
  }
  
  // If there's an overlap, use a distance-based approach to find the closest valid position
  
  // Function to calculate distance between two points
  const calculateDistance = (x1: number, y1: number, x2: number, y2: number) => {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  };
  
  // Function to check if a position is valid (no overlaps)
  const isValidPosition = (posX: number, posY: number) => {
    const testRect = { x: posX, y: posY, width, height };
    return !validElements.some(element => 
      doRectanglesOverlap(testRect, element, bufferPercentage)
    );
  };
  
  // Initial padding to try (start small)
  const initialPadding = Math.max(20, Math.min(width, height) * 0.1); // At least 20px or 10% of element size
  const maxPadding = 300; // Maximum distance to search
  const paddingIncrement = Math.max(20, Math.min(width, height) * 0.05); // At least 20px or 5% of element size
  
  // Preferred directions to try first (right, below, left, above)
  const preferredDirections = [
    { dx: 1, dy: 0 },  // right
    { dx: 0, dy: 1 },  // below
    { dx: -1, dy: 0 }, // left
    { dx: 0, dy: -1 }  // above
  ];
  
  // Additional directions for a more comprehensive search
  const allDirections = [
    ...preferredDirections,
    { dx: 1, dy: 1 },   // bottom-right
    { dx: -1, dy: 1 },  // bottom-left
    { dx: -1, dy: -1 }, // top-left
    { dx: 1, dy: -1 }   // top-right
  ];
  
  // Store candidate positions with their distances
  const candidates: Array<{x: number, y: number, distance: number}> = [];
  
  // Try positions with increasing padding
  for (let padding = initialPadding; padding <= maxPadding; padding += paddingIncrement) {
    // First try preferred directions
    for (const dir of preferredDirections) {
      const posX = x + dir.dx * (width + padding);
      const posY = y + dir.dy * (height + padding);
      
      if (isValidPosition(posX, posY)) {
        candidates.push({
          x: posX,
          y: posY,
          distance: calculateDistance(x, y, posX, posY)
        });
      }
    }
    
    // If we found valid positions with preferred directions, no need to try more
    if (candidates.length > 0) {
      break;
    }
    
    // If preferred directions didn't work, try diagonal directions
    if (padding >= initialPadding * 2) {
      for (let i = 4; i < allDirections.length; i++) {
        const dir = allDirections[i];
        const posX = x + dir.dx * (width + padding);
        const posY = y + dir.dy * (height + padding);
        
        if (isValidPosition(posX, posY)) {
          candidates.push({
            x: posX,
            y: posY,
            distance: calculateDistance(x, y, posX, posY)
          });
        }
      }
      
      // If we found valid positions with any direction, no need to try more
      if (candidates.length > 0) {
        break;
      }
    }
    
    // If standard directions don't work, try intermediate angles at larger distances
    if (padding >= initialPadding * 3) {
      // Try 8 more directions (at 22.5°, 67.5°, 112.5°, etc.)
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        // Skip angles we've already tried (0°, 45°, 90°, etc.)
        if (angle % (Math.PI / 4) === 0) continue;
        
        const posX = x + Math.cos(angle) * (width + padding);
        const posY = y + Math.sin(angle) * (height + padding);
        
        if (isValidPosition(posX, posY)) {
          candidates.push({
            x: posX,
            y: posY,
            distance: calculateDistance(x, y, posX, posY)
          });
        }
      }
      
      if (candidates.length > 0) {
        break;
      }
    }
  }
  
  // If we found valid positions, return the closest one
  if (candidates.length > 0) {
    // Sort by distance (closest first)
    candidates.sort((a, b) => a.distance - b.distance);
    return { x: candidates[0].x, y: candidates[0].y };
  }
  
  // If all else fails, try a position far away but still visible
  // This is a last resort fallback
  const fallbackPositions = [
    { x: x + 150, y: y + 50 },
    { x: x + 50, y: y + 150 },
    { x: x - 150, y: y + 50 },
    { x: x + 50, y: y - 150 }
  ];
  
  for (const pos of fallbackPositions) {
    if (isValidPosition(pos.x, pos.y)) {
      return pos;
    }
  }
  
  // Absolute last resort - just offset by a reasonable amount and hope for the best
  return { x: x + 100, y: y + 100 };
}

/**
 * Calculates target position based on placement mode
 */
export function calculateTargetPosition(
  element: ExcalidrawElement,
  excalidrawAPI: ExcalidrawImperativeAPI,
  mode: PlacementMode,
  initialX?: number,
  initialY?: number
): { x: number; y: number } {
  if (mode === PlacementMode.NEAR_POINT && initialX !== undefined && initialY !== undefined) {
    return { x: initialX, y: initialY };
  }
  
  // Get the viewport info from the API
  const appState = excalidrawAPI.getAppState();
  const width = appState.width || 1280; // Default width if not available
  const height = appState.height || 720; // Default height if not available
  
  // Calculate the center of the viewport
  const viewportCenterX = width / 2;
  const viewportCenterY = height / 2;
  
  // Calculate the center of the element
  const elementCenterX = element.width / 2;
  const elementCenterY = element.height / 2;
  
  // Position the element so its center is at the viewport center
  const x = viewportCenterX - elementCenterX;
  const y = viewportCenterY - elementCenterY;
  
  return { x, y };
}

/**
 * Places an element at a position that doesn't overlap with existing elements
 */
export function placeElement(
  element: ExcalidrawElement,
  excalidrawAPI: ExcalidrawImperativeAPI,
  options: {
    mode?: PlacementMode;
    x?: number;
    y?: number;
    bufferPercentage?: number;
  } = {}
): { x: number; y: number } {
  // Default options
  const { 
    mode = PlacementMode.NEAR_VIEWPORT_CENTER,
    x: initialX, 
    y: initialY, 
    bufferPercentage = 10
  } = options;
  
  // Calculate target position based on placement mode
  const targetPosition = calculateTargetPosition(
    element,
    excalidrawAPI,
    mode,
    initialX,
    initialY
  );
  
  // Find a non-overlapping position
  return findNonOverlappingPosition(
    targetPosition.x,
    targetPosition.y,
    element.width,
    element.height,
    excalidrawAPI.getSceneElements(),
    bufferPercentage
  );
}
