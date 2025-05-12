import { useQuery } from '@tanstack/react-query';

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
      // Ignore if error response is not JSON or empty //TODO
    }
    throw new Error(errorMessage);
  }
  return response.json();
};

export const useAuthStatus = () => {
  const { data, isLoading, error, isError, refetch } = useQuery<AuthStatusResponse, Error>({
    queryKey: ['authStatus'],
    queryFn: fetchAuthStatus,
    // Optional configurations you might consider: //TODO
    // staleTime: 5 * 60 * 1000, // Data is considered fresh for 5 minutes
    // cacheTime: 10 * 60 * 1000, // Data is kept in cache for 10 minutes
    // refetchOnWindowFocus: true, // Automatically refetch when the window gains focus
    // retry: 1, // Retry failed requests once before showing an error
  });

  console.log("Auth status", data);

  return {
    isAuthenticated: data?.authenticated ?? false,
    user: data?.user,
    expires_in: data?.expires_in,
    isLoading,
    error: error || (data?.authenticated === false && data?.message ? new Error(data.message) : null),
    isError,
    refetchAuthStatus: refetch,
  };
};
