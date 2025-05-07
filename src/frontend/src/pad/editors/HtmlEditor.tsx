import React, { useState } from 'react';
import type { NonDeleted, ExcalidrawEmbeddableElement } from '@atyrode/excalidraw/element/types';
import { ExcalidrawElementFactory } from '../../lib/ExcalidrawElementFactory';
import './HtmlEditor.scss';

// Default HTML content for new HTML elements
export const defaultHtml = '<button style="padding: 8px; background: #5294f6; color: white; border: none; border-radius: 4px;">Example Button</button>';

// Hook to manage HTML editor state and functionality
export const useHtmlEditor = (
  element: NonDeleted<ExcalidrawEmbeddableElement>,
  editorRef: React.RefObject<any>,
  excalidrawAPI?: any
) => {
  const [createNew, setCreateNew] = useState(true);

  const applyHtml = () => {
    if (!excalidrawAPI || !editorRef.current) return;
    
    const htmlContent = editorRef.current.getValue();
    const elements = excalidrawAPI.getSceneElements();
    
    // Get the current editor content
    const currentContent = editorRef.current.getValue();
    
    // Create a new iframe element with the HTML content using our factory
    const newElement = ExcalidrawElementFactory.createIframeElement({
      x: createNew ? element.x + element.width + 20 : element.x,
      y: createNew ? element.y : element.y,
      width: element.width,
      height: element.height,
      htmlContent: htmlContent,
      id: createNew ? undefined : element.id,
      customData: {
        editorContent: currentContent,
        editorLanguage: 'html' // Always set to html for HTML content
      }
    });
    
    // If creating a new element, add it to the scene
    // If updating an existing element, replace it in the scene
    if (createNew) {
      excalidrawAPI.updateScene({
        elements: [...elements, newElement]
      });
      excalidrawAPI.scrollToContent(newElement, {
        fitToContent: true,
        viewportZoomFactor: 0.95, // Slight zoom out to ensure element is fully visible
        animate: true
      });
    } else {
      // Replace the existing element
      const updatedElements = elements.map(el => 
        el.id === element.id ? newElement : el
      );
      excalidrawAPI.updateScene({
        elements: updatedElements
      });
    }
    
    excalidrawAPI.setActiveTool({ type: "selection" });
  };

  return {
    createNew,
    setCreateNew,
    applyHtml
  };
};

// HTML-specific toolbar controls component
export const HtmlEditorControls: React.FC<{
  createNew: boolean;
  setCreateNew: (value: boolean) => void;
  applyHtml: () => void;
}> = ({ createNew, setCreateNew, applyHtml }) => {
  return (
    <>
      <label className="html-editor__label">
        <input 
          type="checkbox" 
          checked={createNew} 
          onChange={(e) => setCreateNew(e.target.checked)} 
        /> 
        Create new element
      </label>
      <button className="html-editor__button" onClick={applyHtml}>
        Apply HTML
      </button>
    </>
  );
};
