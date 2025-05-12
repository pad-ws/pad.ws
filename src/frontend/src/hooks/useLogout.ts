import { useMutation, useQueryClient } from '@tanstack/react-query';

interface LogoutResponse {
  status: string;
  logout_url: string;
}

interface LogoutError extends Error {}

const logoutUser = async (): Promise<LogoutResponse> => {
  const response = await fetch('/api/auth/logout', {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    let errorMessage = `Logout failed with status: ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData && (errorData.detail || errorData.message)) {
        errorMessage = errorData.detail || errorData.message;
      }
    } catch (e) {
      console.warn('[pad.ws] Could not parse JSON from logout error response.');
    }
    throw new Error(errorMessage);
  }

  return response.json();
};

export const useLogout = () => {
  const queryClient = useQueryClient();

  return useMutation<LogoutResponse, LogoutError, void>({
    mutationFn: logoutUser,
    onSuccess: (data) => {
      console.debug('[pad.ws] Logout mutation successful, Keycloak URL:', data.logout_url);

      // Invalidate authStatus query to trigger a re-fetch and update UI.
      // This will make useAuthStatus re-evaluate, and isAuthenticated should become false.
      // TODO
      queryClient.invalidateQueries({ queryKey: ['authStatus'] });
    },
    onError: (error) => {
      console.error('[pad.ws] Logout mutation failed:', error.message);
    },
  });
};
