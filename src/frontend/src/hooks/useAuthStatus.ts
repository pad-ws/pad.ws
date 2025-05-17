import { useQuery, useQueryClient, QueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

interface UserInfo {
  username?: string;
  email?: string;
  name?: string;
}

interface AuthStatusResponse {
  authenticated: boolean;
  user?: UserInfo;
  expires_in?: number;
  message?: string;
}

const fetchAuthStatus = async (): Promise<AuthStatusResponse> => {
  const response = await fetch('/api/auth/status');
  if (!response.ok) {
    let errorMessage = 'Failed to fetch authentication status.';
    try {
      const errorData = await response.json();
      if (errorData && errorData.message) {
        errorMessage = errorData.message;
      }
    } catch (e) {
      // Ignore if error response is not JSON or empty
    }
    throw new Error(errorMessage);
  }
  return response.json();
};

const refreshSession = async (): Promise<AuthStatusResponse> => {
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to refresh session');
  }
  return response.json();
};

// Singleton to track if we've already set up the global auth refresher
let isAuthRefresherInitialized = false;

// Set up a global auth refresher that will be initialized only once
const setupGlobalAuthRefresher = (queryClient: QueryClient) => {
  if (isAuthRefresherInitialized) {
    return;
  }

  console.debug('[pad.ws] Setting up global auth refresh mechanism');
  isAuthRefresherInitialized = true;

  // Function to refresh the session when needed
  const refreshSessionIfNeeded = async () => {
    // Get the current auth data from the cache
    const authData = queryClient.getQueryData<AuthStatusResponse>(['authStatus']);

    if (!authData?.authenticated || !authData?.expires_in) {
      return;
    }

    const expiresAt = new Date(Date.now() + authData.expires_in * 1000);
    const currentTime = new Date();

    // If the token has already expired, refetch the status
    if (expiresAt < currentTime) {
      queryClient.invalidateQueries({ queryKey: ['authStatus'] });
      return;
    }

    // Refresh if less than 5 minutes remaining
    const fiveMinutesFromNow = new Date(currentTime.getTime() + 5 * 60 * 1000);
    if (expiresAt < fiveMinutesFromNow) {
      try {
        const newData = await refreshSession();
        queryClient.setQueryData(['authStatus'], newData);
        console.debug('[pad.ws] Auth session refreshed successfully');
      } catch (error) {
        console.error('[pad.ws] Failed to refresh session:', error);
        queryClient.invalidateQueries({ queryKey: ['authStatus'] });
      }
    }
  };

  // Global storage event listener (for auth popup)
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === 'auth_completed') {
      console.debug('[pad.ws] Auth completed event detected, refreshing auth status');
      queryClient.invalidateQueries({ queryKey: ['authStatus'] });
    }
  };

  // Set up a single interval for the entire app
  const intervalId = setInterval(refreshSessionIfNeeded, 60 * 1000);
  window.addEventListener('storage', handleStorageChange);

  // No cleanup function - this is meant to last for the entire app lifecycle
  // In a more complete solution, we'd store these and clean them up on app unmount
};

export const useAuthStatus = () => {
  const queryClient = useQueryClient();

  // Set up the global auth refresher once
  useEffect(() => {
    setupGlobalAuthRefresher(queryClient);
  }, [queryClient]);

  const { data, isLoading, error, isError, refetch } = useQuery<AuthStatusResponse, Error>({
    queryKey: ['authStatus'],
    queryFn: fetchAuthStatus,
  });

  // Still calculate expiresAt for components that might need it
  const expiresAt = useMemo(() => {
    if (data?.expires_in) {
      return new Date(Date.now() + data.expires_in * 1000);
    }
    return null;
  }, [data?.expires_in]);

  return {
    isAuthenticated: data?.authenticated ?? undefined,
    user: data?.user,
    expires_in: data?.expires_in,
    isLoading,
    error: error || (data?.authenticated === false && data?.message ? new Error(data.message) : null),
    isError,
    refetchAuthStatus: refetch,
  };
};
