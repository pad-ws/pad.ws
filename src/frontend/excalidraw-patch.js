// Patch Excalidraw to allow same-origin for all embedded content
(function() {

  // Patch at the prototype level to affect all future iframe instances
  const patchIframePrototype = () => {
    try {
      const originalSetAttribute = HTMLIFrameElement.prototype.setAttribute;
      
      // Override the setAttribute method for iframes
      HTMLIFrameElement.prototype.setAttribute = function(name, value) {
        if (name === 'sandbox' && !value.includes('allow-same-origin')) {
          value = value + ' allow-same-origin';
          console.debug("Intercepted iframe setAttribute for sandbox, added allow-same-origin");
        }
        
        return originalSetAttribute.call(this, name, value);
      };
      
      console.debug("Patched HTMLIFrameElement.prototype.setAttribute");
    } catch (e) {
      console.error("Failed to patch iframe prototype:", e);
    }
  };
  
  // Initialize immediately if document is already loaded
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    patchIframePrototype();
  } else {
    // Otherwise wait for the DOM to be ready
    window.addEventListener('DOMContentLoaded', patchIframePrototype);
  }
  
  // Also initialize on load to be sure
  window.addEventListener('load', patchIframePrototype);
})();
