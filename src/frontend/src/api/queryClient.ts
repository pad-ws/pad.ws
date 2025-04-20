import { QueryClient } from '@tanstack/react-query';

// Create a client
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      staleTime: 30000, // 30 seconds
      cacheTime: 1000 * 60 * 5, // 5 minutes
      refetchOnMount: true,
    },
  },
});
