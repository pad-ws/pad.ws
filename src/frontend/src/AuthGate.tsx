import React, { useEffect, useRef, useState } from "react";

/**
 * If unauthenticated, it shows the AuthModal as an overlay, but still renders the app behind it.
 * 
 * If authenticated, it silently primes the Coder OIDC session by loading
 * the OIDC callback endpoint in a hidden iframe. This is a workaround:
 * without this, users would see the Coder login screen when opening an embedded terminal.
 * 
 * The iframe is removed as soon as it loads, or after a fallback timeout.
 */
export default function AuthGate() {
  const [coderAuthDone, setCoderAuthDone] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const isAuthenticated = false; //TODO

  useEffect(() => {
    // Only run the Coder OIDC priming once per session, after auth is confirmed
    if (isAuthenticated && !coderAuthDone) {
      const setupIframe = async () => {
        try {
          // Get config from API
          const config = {
            coderUrl: 'https://coder.pad.ws' //TODO
          };
          
          if (!config.coderUrl) {
            console.warn('[pad.ws] Coder URL not found, skipping OIDC priming');
            setCoderAuthDone(true);
            return;
          }
          
          const iframe = document.createElement("iframe");
          iframe.style.display = "none";
          iframe.src = `${config.coderUrl}/api/v2/users/oidc/callback`;
          console.debug(`[pad.ws] (Silently) Priming Coder OIDC session for ${config.coderUrl}`);

          // Remove iframe as soon as it loads, or after fallback timeout
          const cleanup = () => {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            setCoderAuthDone(true);
          };

          iframe.onload = cleanup;
          document.body.appendChild(iframe);
          iframeRef.current = iframe;

          // Fallback: remove iframe after 5s if onload doesn't fire
          timeoutRef.current = window.setTimeout(cleanup, 5000);
        } catch (error) {
          console.error('[pad.ws] Error setting up Coder OIDC priming:', error);
          setCoderAuthDone(true);
        }
      };
      
      setupIframe();
      
      // Cleanup on unmount or re-run
      return () => {
        if (iframeRef.current && iframeRef.current.parentNode) {
          iframeRef.current.parentNode.removeChild(iframeRef.current);
        }
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, coderAuthDone]);

  return null;
}
