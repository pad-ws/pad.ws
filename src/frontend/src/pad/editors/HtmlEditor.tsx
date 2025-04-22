import React, { useState, useRef } from 'react';
import type { NonDeleted, ExcalidrawEmbeddableElement } from '@atyrode/excalidraw/element/types';
import type { AppState } from '@atyrode/excalidraw/types';
import Editor from '@monaco-editor/react';
import { ExcalidrawElementFactory } from '../../lib/ExcalidrawElementFactory';
import '../../styles/HtmlEditor.scss';

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
  const [editorValue, setEditorValue] = useState('<button style="padding: 8px; background: #5294f6; color: white; border: none; border-radius: 4px;">Example Button</button>');
  const editorRef = useRef<any>(null);

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  const applyHtml = () => {
    if (!excalidrawAPI || !editorRef.current) return;
    
    const htmlContent = editorRef.current.getValue();
    const elements = excalidrawAPI.getSceneElements();
    
    // Create a new iframe element with the HTML content using our factory
    const newElement = ExcalidrawElementFactory.createIframeElement({
      x: createNew ? element.x + element.width + 20 : element.x,
      y: createNew ? element.y : element.y,
      width: element.width,
      height: element.height,
      htmlContent: htmlContent,
      id: createNew ? undefined : element.id
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
          defaultLanguage="html"
          defaultValue={editorValue}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 12,
            automaticLayout: true
          }}
          onMount={handleEditorDidMount}
          onChange={(value) => value && setEditorValue(value)}
          className="monaco-editor-container"
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
