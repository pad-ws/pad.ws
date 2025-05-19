import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { scheduleTokenRefresh, AUTH_STATUS_KEY } from '../lib/authRefreshManager';

export interface UserInfo {
  id?: string;
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

// API function for getting status
const getAuthStatus = async (): Promise<AuthStatusResponse> => {
  const response = await fetch('/api/auth/status');
  if (!response.ok) {
    throw new Error('Failed to fetch authentication status');
  }
  return response.json();
};

export const useAuthStatus = () => {
  const queryClient = useQueryClient();

  // Main auth status query
  const {
    data,
    isLoading,
    error,
    isError,
    refetch
  } = useQuery({
    queryKey: [AUTH_STATUS_KEY],
    queryFn: getAuthStatus,
    staleTime: 4 * 60 * 1000, // 4 minutes
  });

  // Schedule refresh when auth data changes
  useEffect(() => {
    if (!data?.authenticated || !data?.expires_in) return;

    scheduleTokenRefresh(
      data.expires_in,
      // Success callback
      (refreshedData) => {
        queryClient.setQueryData([AUTH_STATUS_KEY], refreshedData);
      },
      // Error callback
      () => {
        queryClient.invalidateQueries({ queryKey: [AUTH_STATUS_KEY] });
      }
    );
  }, [data?.authenticated, data?.expires_in, queryClient]);

  // Handle auth events from popup windows
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'auth_completed') {
        queryClient.invalidateQueries({ queryKey: [AUTH_STATUS_KEY] });
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [queryClient]);

  return {
    isAuthenticated: data?.authenticated,
    user: data?.user,
    expires_in: data?.expires_in,
    isLoading,
    error: error || (data?.authenticated === false && data?.message ? new Error(data.message) : null),
    isError,
    refetchAuthStatus: refetch,
  };
};
