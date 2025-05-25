import React, { useRef, useState, useEffect, useCallback } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { Tooltip, updateTooltipPosition, getTooltipDiv } from '@atyrode/excalidraw';
import SearchableLanguageSelector from './SearchableLanguageSelector';
import { useHtmlEditor, HtmlEditorControls, defaultHtml, HtmlEditorSplitView } from './HtmlEditor';
import './Editor.scss';

// Custom tooltip wrapper that positions the tooltip at the top
const TopTooltip: React.FC<{label: string, children: React.ReactNode}> = ({ label, children }) => {
  const handlePointerEnter = (event: React.PointerEvent<HTMLDivElement>) => {
    const tooltip = getTooltipDiv();
    tooltip.classList.add("excalidraw-tooltip--visible");
    tooltip.textContent = label;
    
    const itemRect = event.currentTarget.getBoundingClientRect();
    updateTooltipPosition(tooltip, itemRect, "top");
  };
  
  const handlePointerLeave = () => {
    getTooltipDiv().classList.remove("excalidraw-tooltip--visible");
  };
  
  return (
    <div 
      className="excalidraw-tooltip-wrapper"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {children}
    </div>
  );
};

interface EditorProps {
  defaultValue?: string;
  language?: string;
  theme?: string;
  height?: string | number;
  options?: Record<string, any>;
  onChange?: (value: string | undefined) => void;
  onMount?: (editor: any) => void;
  onLanguageChange?: (language: string) => void; // Callback for language changes
  className?: string;
  showLanguageSelector?: boolean;
  element?: any; // Excalidraw element
  excalidrawAPI?: any; // Excalidraw API instance
  autoSaveInterval?: number; // Interval in ms to auto-save content to customData
}

const Editor: React.FC<EditorProps> = ({
  defaultValue = '',
  language = 'plaintext',
  theme = 'vs-dark',
  height = '100%',
  options = {
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 12,
    automaticLayout: true
  },
  onChange,
  onMount,
  onLanguageChange,
  className = 'editor__container',
  showLanguageSelector = true,
  element,
  excalidrawAPI,
  autoSaveInterval = 2000 // Default to 2 seconds
}) => {
  const editorRef = useRef<any>(null);
  // Initialize currentLanguage from element's customData if available, otherwise use the prop
  const [currentLanguage, setCurrentLanguage] = useState(
    element?.customData?.editorLanguage || language
  );
  const contentRef = useRef(defaultValue);
  const lastSavedContentRef = useRef('');
  const lastSavedLanguageRef = useRef(language);
  const elementIdRef = useRef(element?.id);
  const isInitialMountRef = useRef(true);

  // Special effect to handle initial mount and force language reload
  useEffect(() => {
    // Only run this effect when the editor is mounted
    if (!editorRef.current) return;
    
    if (isInitialMountRef.current && element?.customData?.editorLanguage) {
      // Force a language reload after initial mount
      const model = editorRef.current.getModel();
      if (model) {
        // Force Monaco to update the language model immediately
        model.setLanguage(element.customData.editorLanguage);
        
        // Set a small timeout to force Monaco to re-process the content with the correct language
        setTimeout(() => {
          // This triggers Monaco to re-process the content with the correct language
          const currentValue = model.getValue();
          model.setValue(currentValue);
        }, 50);
      }
      
      isInitialMountRef.current = false;
    }
  }, [element?.customData?.editorLanguage]);

  // Update editor content when element changes (e.g., when cloned or pasted)
  useEffect(() => {
    if (!editorRef.current || !element) return;
    
    // Check if element ID has changed (indicating a new element)
    if (element.id !== elementIdRef.current) {
      elementIdRef.current = element.id;
      
      // First update language if needed - do this before setting content
      if (element.customData?.editorLanguage) {
        setCurrentLanguage(element.customData.editorLanguage);
        lastSavedLanguageRef.current = element.customData.editorLanguage;
        
        // Force Monaco to update the language model immediately
        const model = editorRef.current.getModel();
        if (model) {
          model.setLanguage(element.customData.editorLanguage);
          
          // Then update the editor content after language is set
          if (element.customData?.editorContent) {
            model.setValue(element.customData.editorContent);
            contentRef.current = element.customData.editorContent;
            lastSavedContentRef.current = element.customData.editorContent;
            
            // Force a re-processing of the content with the new language after a short delay
            // This is crucial for fixing linting errors when pasting/cloning elements
            setTimeout(() => {
              const currentValue = model.getValue();
              model.setValue(currentValue);
            }, 50);
          }
        } else {
          // Fallback if model isn't available
          if (element.customData?.editorContent) {
            editorRef.current.setValue(element.customData.editorContent);
            contentRef.current = element.customData.editorContent;
            lastSavedContentRef.current = element.customData.editorContent;
          }
        }
      } else if (element.customData?.editorContent) {
        // If no language change but content exists
        editorRef.current.setValue(element.customData.editorContent);
        contentRef.current = element.customData.editorContent;
        lastSavedContentRef.current = element.customData.editorContent;
      }
    }
  }, [element, showLanguageSelector]);

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
    
    // First check and set the language before setting content
    // This ensures Monaco uses the correct language mode from the start
    if (element?.customData?.editorLanguage) {
      setCurrentLanguage(element.customData.editorLanguage);
      lastSavedLanguageRef.current = element.customData.editorLanguage;
      
      const model = editor.getModel();
      if (model) {
        // Force Monaco to update the language model immediately
        model.setLanguage(element.customData.editorLanguage);
        
        // Now set the content after language is properly initialized
        if (element?.customData?.editorContent) {
          model.setValue(element.customData.editorContent);
          contentRef.current = element.customData.editorContent;
          lastSavedContentRef.current = element.customData.editorContent;
          
          // Force a re-processing of the content with the correct language after a short delay
          setTimeout(() => {
            const currentValue = model.getValue();
            model.setValue(currentValue);
          }, 50);
        }
      } else {
        // Fallback if model isn't available
        if (element?.customData?.editorContent) {
          editor.setValue(element.customData.editorContent);
          contentRef.current = element.customData.editorContent;
          lastSavedContentRef.current = element.customData.editorContent;
        }
      }
    } else if (element?.customData?.editorContent) {
      // If no language change but content exists
      editor.setValue(element.customData.editorContent);
      contentRef.current = element.customData.editorContent;
      lastSavedContentRef.current = element.customData.editorContent;
    }
    
    if (onMount) {
      onMount(editor);
    }
  };

  // Update editor content when it changes
  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      contentRef.current = value;
    }
    if (onChange) {
      onChange(value);
    }
  };

  // Save editor content to element's customData
  const saveContentToCustomData = useCallback(() => {
    if (!element || !excalidrawAPI || !editorRef.current) return;
    
    // Get the current content from the editor
    const content = editorRef.current.getValue();
    
    // Only save if content or language has changed
    if (content === lastSavedContentRef.current && 
        currentLanguage === lastSavedLanguageRef.current) {
      return;
    }
    
    // Update refs to track what we've saved
    lastSavedContentRef.current = content;
    lastSavedLanguageRef.current = currentLanguage;
    
    // Get all elements from the scene
    const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
    
    // Find and update the element
    const updatedElements = elements.map(el => {
      if (el.id === element.id) {
        // Create a new customData object with the updated editorContent
        const customData = {
          ...(el.customData || {}),
          editorContent: content,
          editorLanguage: currentLanguage
        };
        
        return { ...el, customData };
      }
      return el;
    });
    
    // Update the scene with the modified elements
    excalidrawAPI.updateScene({
      elements: updatedElements
    });
  }, [element, excalidrawAPI, currentLanguage]);

  // Set up auto-save interval
  useEffect(() => {
    if (!element || !excalidrawAPI) return;
    
    // Set up interval for auto-saving
    const intervalId = setInterval(saveContentToCustomData, autoSaveInterval);
    
    // Clean up interval on unmount
    return () => {
      clearInterval(intervalId);
      // Save one last time when unmounting
      saveContentToCustomData();
    };
  }, [element, excalidrawAPI, saveContentToCustomData, autoSaveInterval]);

  const handleLanguageChange = (newLanguage: string) => {
    setCurrentLanguage(newLanguage);
    
    // Force Monaco to update the language model immediately when language is changed
    if (editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        // Update the language
        model.setLanguage(newLanguage);
        
        // Force a re-processing of the content with the new language
        // This is what fixes the linting errors when manually switching languages
        setTimeout(() => {
          const currentValue = model.getValue();
          model.setValue(currentValue);
        }, 10);
      }
    }
    
    // Notify parent component about language change
    if (onLanguageChange) {
      onLanguageChange(newLanguage);
    }
  };

  // Format document function
  const formatDocument = () => {
    if (editorRef.current) {
      // Trigger Monaco's format document action
      editorRef.current.getAction('editor.action.formatDocument')?.run();
    }
  };

  // Check if the language is HTML
  const isHtml = currentLanguage === 'html';
  
  // Always initialize HTML editor hooks, but pass isActive flag
  const htmlEditor = useHtmlEditor(
    element, 
    editorRef, 
    excalidrawAPI, 
    isHtml
  );
    
  // Determine if we should show the split view
  const showSplitView = isHtml && !htmlEditor.createNew && htmlEditor.showPreview;

  return (
    <div className={`editor__wrapper ${showSplitView ? 'editor__wrapper--split' : ''}`}>
      <MonacoEditor
        height={height}
        language={currentLanguage}
        defaultValue={defaultValue || (isHtml ? defaultHtml : '')}
        theme={theme}
        options={options}
        onMount={handleEditorDidMount}
        onChange={handleEditorChange}
        className={className}
      />
      
      {/* Render the HTML preview in split view mode */}
      {showSplitView && (
        <HtmlEditorSplitView
          editorContent={contentRef.current || ''}
          previewContent={htmlEditor.previewContent}
          showPreview={htmlEditor.showPreview}
        />
      )}
      {showLanguageSelector && (
        <div className="editor__toolbar">
          {/* Show HTML-specific controls when language is HTML */}
          {isHtml && (
            <div className="editor__html-controls">
              <HtmlEditorControls
                createNew={htmlEditor.createNew}
                setCreateNew={htmlEditor.setCreateNew}
                applyHtml={htmlEditor.applyHtml}
                showPreview={htmlEditor.showPreview}
                togglePreview={htmlEditor.togglePreview}
              />
            </div>
          )}
          
          {/* Group format button and language selector together on the right */}
          <div className="editor__toolbar-right">
            <TopTooltip label="Format" children={
              <button 
                className="editor__format-button" 
                onClick={formatDocument}
                aria-label="Format Document"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 4H14M4 8H12M6 12H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            } />
            
            <SearchableLanguageSelector 
              value={currentLanguage} 
              onChange={handleLanguageChange}
              className="editor__language-selector"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Editor;
