import type { 
  ExcalidrawElement,
  ExcalidrawEmbeddableElement,
  ExcalidrawIframeElement,
  FillStyle,
  StrokeStyle,
  RoundnessType 
} from '@atyrode/excalidraw/element/types';
import type { ExcalidrawImperativeAPI } from '@atyrode/excalidraw/types';
import { 
  PlacementMode, 
  placeElement 
} from '../utils/elementPlacement';

// Re-export PlacementMode to maintain backward compatibility
export { PlacementMode } from '../utils/elementPlacement';

// Base interface with common properties for all Excalidraw elements
interface BaseElementOptions {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: FillStyle;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
  roundness?: { type: RoundnessType; value?: number };
  roughness?: number;
  opacity?: number;
  boundElements?: any[] | null;
  id?: string;
  locked?: boolean;
  customData?: Record<string, any>;
}

// Interface for embeddable element options
export interface EmbeddableElementOptions extends BaseElementOptions {
  link: string;
}

// Interface for iframe element options
interface IframeElementOptions extends BaseElementOptions {
  htmlContent: string;
}

export class ExcalidrawElementFactory {
  // Create a base skeleton element with common properties
  private static createBaseSkeleton(
    options: BaseElementOptions,
    defaults: Partial<BaseElementOptions> = {}
  ): {
    x: number;
    y: number;
    width: number;
    height: number;
    angle: number;
    strokeColor: string;
    backgroundColor: string;
    fillStyle: FillStyle;
    strokeWidth: number;
    strokeStyle: StrokeStyle;
    roundness: { type: RoundnessType; value?: number };
    roughness: number;
    opacity: number;
    groupIds: [];
    frameId: null;
    seed: number;
    version: number;
    versionNonce: number;
    isDeleted: boolean;
    boundElements: any[] | null;
    id: string;
    locked: boolean;
    updated: number;
    index: undefined;
    customData: Record<string, any>;
  } {
    return {
      x: options.x ?? defaults.x ?? 0,
      y: options.y ?? defaults.y ?? 0,
      width: options.width ?? defaults.width ?? 460,
      height: options.height ?? defaults.height ?? 80,
      angle: options.angle ?? defaults.angle ?? 0,
      strokeColor: options.strokeColor ?? defaults.strokeColor ?? "#ced4da",
      backgroundColor: options.backgroundColor ?? defaults.backgroundColor ?? "#e9ecef",
      fillStyle: options.fillStyle ?? defaults.fillStyle ?? "solid" as FillStyle,
      strokeWidth: options.strokeWidth ?? defaults.strokeWidth ?? 4,
      strokeStyle: options.strokeStyle ?? defaults.strokeStyle ?? "solid" as StrokeStyle,
      roundness: options.roundness ?? defaults.roundness ?? { type: 3 as RoundnessType },
      roughness: options.roughness ?? defaults.roughness ?? 0,
      opacity: options.opacity ?? defaults.opacity ?? 100,
      groupIds: [],
      frameId: null,
      seed: Math.floor(Math.random() * 100000),
      version: 1,
      versionNonce: Math.floor(Math.random() * 100000),
      isDeleted: false,
      boundElements: options.boundElements ?? defaults.boundElements ?? [],
      id: options.id ?? Math.random().toString(36).substring(2, 15),
      locked: options.locked ?? defaults.locked ?? false,
      updated: Date.now(),
      index: undefined,
      customData: options.customData ?? defaults.customData ?? {}
    };
  }

  // Create a basic embeddable element with defaults
  static createEmbeddableElement(options: EmbeddableElementOptions): ExcalidrawEmbeddableElement {
    const defaults: Partial<BaseElementOptions> = {
      width: 460,
      height: 80,
    };

    const element = this.createBaseSkeleton(options, defaults);
    
    return {
      ...element,
      type: "embeddable",
      link: options.link,
      customData: {
        showHyperlinkIcon: false
      }
    };
  }

  // Create an iframe element with HTML content
  static createIframeElement(options: IframeElementOptions): ExcalidrawIframeElement {
    const defaults: Partial<BaseElementOptions> = {
      width: 600,
      height: 400,
      strokeColor: "#ced4da",
      backgroundColor: "transparent",
      strokeWidth: 4,
      roughness: 0,
      roundness: { type: 3 as RoundnessType }
    };

    const element = this.createBaseSkeleton(options, defaults);
    
    return {
      ...element,
      type: 'iframe',
      link: null,
      customData: {
        generationData: {
          status: "done",
          html: options.htmlContent
        },
        ...(options.customData || {})
      }
    };
  }

  /**
   * Places an element in the scene at a position that doesn't overlap with existing elements
   * @param element - The Excalidraw element to place
   * @param excalidrawAPI - The Excalidraw API instance
   * @param options - Placement options
   * @returns The placed element with updated position
   */
  static placeInScene(
    element: ExcalidrawElement,
    excalidrawAPI: ExcalidrawImperativeAPI,
    options: {
      mode?: PlacementMode;
      x?: number;
      y?: number;
      bufferPercentage?: number;
      scrollToView?: boolean;
    } = {}
  ): ExcalidrawElement {
    // Default options
    const { 
      mode = PlacementMode.NEAR_VIEWPORT_CENTER,
      x: initialX, 
      y: initialY, 
      bufferPercentage = 10,
      scrollToView = true 
    } = options;
    
    // Find position using the utility function
    const position = placeElement(
      element,
      excalidrawAPI,
      {
        mode,
        x: initialX,
        y: initialY,
        bufferPercentage
      }
    );
    
    // Update element position
    const updatedElement = {
      ...element,
      x: position.x,
      y: position.y
    };
    
    // Add to scene
    this.addToScene(updatedElement, excalidrawAPI, scrollToView);
    
    return updatedElement;
  }

  // Helper for adding to scene and scrolling
  static addToScene(
    element: ExcalidrawElement,
    excalidrawAPI: ExcalidrawImperativeAPI,
    scrollToView: boolean = true
  ): void {
    const elements = excalidrawAPI.getSceneElements();
    
    excalidrawAPI.updateScene({
      elements: [...elements, element],
    });
    
    if (scrollToView) {
      excalidrawAPI.scrollToContent(element, {
        fitToContent: true,
        viewportZoomFactor: 0.95, // Slight zoom out to ensure element is fully visible
        animate: true
      });
      excalidrawAPI.setActiveTool({ type: "selection" });
    }
  }
}
