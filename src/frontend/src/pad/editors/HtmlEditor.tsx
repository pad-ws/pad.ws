import React, { useState, useEffect } from 'react';
import type { NonDeleted, ExcalidrawEmbeddableElement } from '@atyrode/excalidraw/element/types';
import { ExcalidrawElementFactory } from '../../lib/ExcalidrawElementFactory';
import HtmlPreview from './HtmlPreview';
import './HtmlEditor.scss';

// Default HTML content for new HTML elements with API usage documentation as a comment
export const defaultHtml = `<!-- 
  HTML Preview with API Support
  
  You can make authenticated API calls from your HTML using window.callApi()
  
  Examples:
  
  // GET request
  window.callApi('/api/endpoint')
    .then(data => console.log(data))
    .catch(error => console.error(error));
  
  // POST request with data
  window.callApi('/api/endpoint', 'POST', { key: 'value' })
    .then(data => console.log(data))
    .catch(error => console.error(error));
  
  All API calls use the current viewer's authentication token (not the creator's),
  making it safe for multiplayer environments.
-->
<button style="padding: 8px; background: #5294f6; color: white; border: none; border-radius: 4px;">Example Button</button>`;


// Hook to manage HTML editor state and functionality
export const useHtmlEditor = (
  element: NonDeleted<ExcalidrawEmbeddableElement> | undefined,
  editorRef: React.RefObject<any>,
  excalidrawAPI?: any,
  isActive: boolean = true // New parameter to control if the hook is active
) => {
  // Always initialize these hooks regardless of isActive
  const [createNew, setCreateNew] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  
  // Update preview content when editor content changes
  useEffect(() => {
    if (!isActive || !showPreview || !editorRef.current) return;
    
    try {
      // Get the current content from the editor
      const currentContent = editorRef.current.getValue();
      setPreviewContent(currentContent);
    } catch (error) {
      // Handle case where editor model might be disposed
      console.warn("Could not get editor value:", error);
    }
  }, [showPreview, editorRef, isActive]);

  const applyHtml = () => {
    if (!isActive || !excalidrawAPI || !editorRef.current || !element) return;
    
    try {
      const htmlContent = editorRef.current.getValue();
      
      // If not creating a new element, show the preview instead
      if (!createNew) {
        setPreviewContent(htmlContent);
        setShowPreview(true);
        return;
      }
      
      // Otherwise, create a new element as before
      const elements = excalidrawAPI.getSceneElements();
      
      // Get the current editor content
      const currentContent = editorRef.current.getValue();
      
      // Create a new iframe element with the HTML content using our factory
      const newElement = ExcalidrawElementFactory.createIframeElement({
        x: element.x + element.width + 20,
        y: element.y,
        width: element.width,
        height: element.height,
        htmlContent: htmlContent,
        id: undefined, // Always create a new element
        customData: {
          editorContent: currentContent,
          editorLanguage: 'html' // Always set to html for HTML content
        }
      });
      
      // Add the new element to the scene
      excalidrawAPI.updateScene({
        elements: [...elements, newElement]
      });
      excalidrawAPI.scrollToContent(newElement, {
        fitToContent: true,
        viewportZoomFactor: 0.95, // Slight zoom out to ensure element is fully visible
        animate: true
      });
      
      excalidrawAPI.setActiveTool({ type: "selection" });
    } catch (error) {
      console.warn("Error applying HTML:", error);
    }
  };

  const togglePreview = () => {
    if (!isActive) return;
    
    if (showPreview) {
      setShowPreview(false);
    } else {
      try {
        const htmlContent = editorRef.current?.getValue() || '';
        setPreviewContent(htmlContent);
        setShowPreview(true);
      } catch (error) {
        console.warn("Could not toggle preview:", error);
      }
    }
  };

  return {
    createNew,
    setCreateNew: (value: boolean) => isActive && setCreateNew(value),
    showPreview,
    setShowPreview: (value: boolean) => isActive && setShowPreview(value),
    previewContent,
    setPreviewContent: (value: string) => isActive && setPreviewContent(value),
    applyHtml,
    togglePreview
  };
};


// HTML-specific toolbar controls component
export const HtmlEditorControls: React.FC<{
  createNew: boolean;
  setCreateNew: (value: boolean) => void;
  applyHtml: () => void;
  showPreview?: boolean;
  togglePreview?: () => void;
}> = ({ createNew, setCreateNew, applyHtml, showPreview, togglePreview }) => {
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
        {createNew ? "Apply HTML" : "Update Preview"}
      </button>
      
      {!createNew && togglePreview && (
        <button 
          className={`html-editor__button ${showPreview ? 'html-editor__button--active' : ''}`} 
          onClick={togglePreview}
        >
          {showPreview ? "Hide Preview" : "Show Preview"}
        </button>
      )}
    </>
  );
};

// Split view component for HTML editor
export const HtmlEditorSplitView: React.FC<{
  editorContent: string;
  previewContent: string;
  showPreview: boolean;
}> = ({ editorContent, previewContent, showPreview }) => {
  if (!showPreview) {
    return null;
  }
  
  return (
    <div className="html-editor__split-view">
      <HtmlPreview htmlContent={previewContent} />
    </div>
  );
};
