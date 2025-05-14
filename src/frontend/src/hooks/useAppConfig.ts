import { useQuery } from '@tanstack/react-query';

interface AppConfig {
  coderUrl: string;
  posthogKey: string;
  posthogHost: string;
}

const fetchAppConfig = async (): Promise<AppConfig> => {
  const response = await fetch('/api/app/config');
  if (!response.ok) {
    let errorMessage = 'Failed to fetch app configuration.';
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

export const useAppConfig = () => {
  const { data, isLoading, error, isError } = useQuery<AppConfig, Error>({
    queryKey: ['appConfig'],
    queryFn: fetchAppConfig,
    staleTime: Infinity, // Config is not expected to change during a session
    gcTime: Infinity, // Renamed from cacheTime in v5
  });

  return {
    config: data,
    isLoadingConfig: isLoading,
    configError: error,
    isConfigError: isError,
  };
};
