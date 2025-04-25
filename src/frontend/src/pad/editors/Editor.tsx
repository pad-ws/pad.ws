import React, { useRef, useState, useEffect, useCallback } from 'react';
import MonacoEditor from '@monaco-editor/react';
import LanguageSelector from './LanguageSelector';
import './Editor.scss';

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
  language = 'javascript',
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
  className = 'monaco-editor-container',
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
    const elements = excalidrawAPI.getSceneElements();
    
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

  return (
    <div className="editor-wrapper">
      <MonacoEditor
        height={height}
        language={currentLanguage}
        defaultValue={defaultValue}
        theme={theme}
        options={options}
        onMount={handleEditorDidMount}
        onChange={handleEditorChange}
        className={className}
      />
      {showLanguageSelector && (
        <div className="editor-toolbar">
          <LanguageSelector 
            value={currentLanguage} 
            onChange={handleLanguageChange} 
          />
        </div>
      )}
    </div>
  );
};

export default Editor;
