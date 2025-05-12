import { useQuery, useQueryClient } from '@tanstack/react-query';
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

export const useAuthStatus = () => {
  const queryClient = useQueryClient();

  const { data, isLoading, error, isError, refetch } = useQuery<AuthStatusResponse, Error>({
    queryKey: ['authStatus'],
    queryFn: fetchAuthStatus,
  });

  const expiresAt = useMemo(() => {
    if (data?.expires_in) {
      return new Date(Date.now() + data.expires_in * 1000);
    }
    return null;
  }, [data?.expires_in]);

  useEffect(() => {
    const refreshSessionIfNeeded = async () => {
      if (!data?.authenticated || !expiresAt) {
        return;
      }

      const currentTime = new Date();

      // If the token has already expired, refetch the status
      if (expiresAt < currentTime) {
        refetch();
        return;
      }

      // Refresh if less than 5 minutes remaining
      const fiveMinutesFromNow = new Date(currentTime.getTime() + 5 * 60 * 1000);
      if (expiresAt < fiveMinutesFromNow) {
        try {
          const newData = await refreshSession();
          queryClient.setQueryData(['authStatus'], newData);
        } catch (error) {
          console.error('Failed to refresh session:', error);
          refetch();
        }
      }
    };

    // Handle auth completion from popup
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'auth_completed') {
        refetch();
      }
    };

    // Set up interval to check session expiry
    const intervalId = setInterval(refreshSessionIfNeeded, 60 * 1000);

    // Add event listeners
    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [data, queryClient, refetch, expiresAt]);

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
