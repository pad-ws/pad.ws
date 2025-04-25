import React, { useState, useRef, useEffect } from 'react';
import type { NonDeleted, ExcalidrawEmbeddableElement } from '@atyrode/excalidraw/element/types';
import type { AppState } from '@atyrode/excalidraw/types';
import Editor from './Editor';
import { ExcalidrawElementFactory } from '../../lib/ExcalidrawElementFactory';
import './HtmlEditor.scss';

interface HtmlEditorProps {
  element: NonDeleted<ExcalidrawEmbeddableElement>;
  appState: AppState;
  excalidrawAPI?: any;
}

export const HtmlEditor: React.FC<HtmlEditorProps> = ({ 
  element, 
  appState,
  excalidrawAPI
}) => {
  const [createNew, setCreateNew] = useState(true);
  const defaultHtml = '<button style="padding: 8px; background: #5294f6; color: white; border: none; border-radius: 4px;">Example Button</button>';
  const [editorValue, setEditorValue] = useState(
    element.customData?.editorContent || defaultHtml
  );
  const editorRef = useRef<any>(null);
  const elementIdRef = useRef(element.id);

  // Load content from customData when element changes (e.g., when cloned or pasted)
  useEffect(() => {
    // Check if element ID has changed (indicating a new element)
    if (element.id !== elementIdRef.current) {
      elementIdRef.current = element.id;
      
      // If element has customData with editorContent, update the state
      if (element.customData?.editorContent) {
        setEditorValue(element.customData.editorContent);
      } else {
        setEditorValue(defaultHtml);
      }
      
      // Note: We don't need to update language here since HtmlEditor always uses 'html'
      // But we still save it in customData for consistency
    }
  }, [element.id, element.customData, defaultHtml]);

  const handleEditorMount = (editor: any) => {
    editorRef.current = editor;
  };

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
        editorLanguage: 'html' // Always set to html for HtmlEditor
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

  return (
    <div className="html-editor-container">
      <div className="html-editor-content">
        <Editor
          height="100%"
          language="html"
          defaultValue={editorValue}
          onChange={(value) => value && setEditorValue(value)}
          onMount={handleEditorMount}
          element={element}
          excalidrawAPI={excalidrawAPI}
          showLanguageSelector={false}
        />
        <div className="html-editor-controls">
          <label>
            <input 
              type="checkbox" 
              checked={createNew} 
              onChange={(e) => setCreateNew(e.target.checked)} 
            /> 
            Create new element
          </label>
          <button onClick={applyHtml}>
            Apply HTML
          </button>
        </div>
      </div>
    </div>
  );
};
