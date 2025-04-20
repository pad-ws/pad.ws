import React, { useEffect, useState } from "react";
import { useAuthCheck } from "./api/hooks";
import AuthModal from "./auth/AuthModal";

/**
 * AuthGate ensures the authentication check is the very first XHR request.
 * It blocks rendering of children until the auth check completes.
 * If unauthenticated, it shows the AuthModal.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { data: isAuthenticated, isLoading } = useAuthCheck();
  const [coderAuthDone, setCoderAuthDone] = useState(false);

  useEffect(() => {
    // When authenticated, also authenticate with Coder using an iframe
    if (isAuthenticated === true && !coderAuthDone) {
      // Create a hidden iframe to handle Coder authentication
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = 'https://coder.pad.ws/api/v2/users/oidc/callback';

      // Add the iframe to the document
      document.body.appendChild(iframe);

      // Clean up after a short delay
      setTimeout(() => {
        document.body.removeChild(iframe);
        setCoderAuthDone(true);
      }, 2000); // 2 seconds should be enough for the auth to complete
    }
  }, [isAuthenticated, coderAuthDone]);

  // Always render children (App), but overlay AuthModal if unauthenticated
  return (
    <>
      {children}
      {isAuthenticated === false && !isLoading && <AuthModal />}
    </>
  );
}
