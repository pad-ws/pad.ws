import { useQuery, useMutation, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import { fetchApi } from './apiUtils';
import { queryClient } from './queryClient';

// Types
export interface WorkspaceState {
  status: 'running' | 'starting' | 'stopping' | 'stopped' | 'error';
  workspace_id: string | null;
  username: string | null;
  base_url: string | null;
  agent: string | null;
  error?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  name: string;
  given_name: string;
  family_name: string;
  email_verified: boolean;
}

export interface CanvasData {
  elements: any[];
  appState: any;
  files: any;
}

export interface CanvasBackup {
  id: number;
  timestamp: string;
  data: CanvasData;
}

export interface CanvasBackupsResponse {
  backups: CanvasBackup[];
}

// API functions
export const api = {
  // Authentication
  checkAuth: async (): Promise<boolean> => {
    try {
      await fetchApi('/api/workspace/state');
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === 'Unauthorized') {
        return false;
      }
      throw error;
    }
  },
  
  // User profile
  getUserProfile: async (): Promise<UserProfile> => {
    try {
      const result = await fetchApi('/api/users/me');
      return result;
    } catch (error) {
      throw error;
    }
  },
  
  // Workspace
  getWorkspaceState: async (): Promise<WorkspaceState> => {
    try {
      const result = await fetchApi('/api/workspace/state');
      // Map backend 'state' property to frontend 'status'
      return { ...result, status: result.state };
    } catch (error) {
      // Let the error propagate to be handled by the global error handler
      throw error;
    }
  },
  
  startWorkspace: async (): Promise<any> => {
    try {
      const result = await fetchApi('/api/workspace/start', { method: 'POST' });
      return result;
    } catch (error) {
      throw error;
    }
  },
  
  stopWorkspace: async (): Promise<any> => {
    try {
      const result = await fetchApi('/api/workspace/stop', { method: 'POST' });
      return result;
    } catch (error) {
      throw error;
    }
  },
  
  // Canvas
  getCanvas: async (): Promise<CanvasData> => {
    try {
      const result = await fetchApi('/api/pad/');
      return result;
    } catch (error) {
      throw error;
    }
  },
  
  saveCanvas: async (data: CanvasData): Promise<any> => {
    try {
      const result = await fetchApi('/api/pad/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return result;
    } catch (error) {
      throw error;
    }
  },
  
  getDefaultCanvas: async (): Promise<CanvasData> => {
    try {
      const result = await fetchApi('/api/pad/from-template/default');
      return result;
    } catch (error) {
      throw error;
    }
  },

  // Canvas Backups
  getCanvasBackups: async (limit: number = 10): Promise<CanvasBackupsResponse> => {
    try {
      const result = await fetchApi(`/api/pad/recent?limit=${limit}`);
      return result;
    } catch (error) {
      throw error;
    }
  },
};

// Query hooks
export function useAuthCheck(options?: UseQueryOptions<boolean>) {
  return useQuery({
    queryKey: ['auth'],
    queryFn: api.checkAuth,
    ...options,
  });
}

export function useUserProfile(options?: UseQueryOptions<UserProfile>) {
  return useQuery({
    queryKey: ['userProfile'],
    queryFn: api.getUserProfile,
    ...options,
  });
}

export function useWorkspaceState(options?: UseQueryOptions<WorkspaceState>) {
  // Get the current auth state from the query cache
  const authState = queryClient.getQueryData<boolean>(['auth']);
  
  return useQuery({
    queryKey: ['workspaceState'],
    queryFn: api.getWorkspaceState,
    // Only poll if authenticated
    refetchInterval: authState === true ? 5000 : false, // Poll every 5 seconds if authenticated, otherwise don't poll
    // Don't retry on error if not authenticated
    retry: authState === true ? 1 : false,
    ...options,
  });
}

export function useCanvas(options?: UseQueryOptions<CanvasData>) {
  return useQuery({
    queryKey: ['canvas'],
    queryFn: api.getCanvas,
    ...options,
  });
}

export function useDefaultCanvas(options?: UseQueryOptions<CanvasData>) {
  return useQuery({
    queryKey: ['defaultCanvas'],
    queryFn: api.getDefaultCanvas,
    ...options,
  });
}

export function useCanvasBackups(limit: number = 10, options?: UseQueryOptions<CanvasBackupsResponse>) {
  return useQuery({
    queryKey: ['canvasBackups', limit],
    queryFn: () => api.getCanvasBackups(limit),
    ...options,
  });
}

// Mutation hooks
export function useStartWorkspace(options?: UseMutationOptions) {
  return useMutation({
    mutationFn: api.startWorkspace,
    onSuccess: () => {
      // Invalidate workspace state query to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['workspaceState'] });
    },
    ...options,
  });
}

export function useStopWorkspace(options?: UseMutationOptions) {
  return useMutation({
    mutationFn: api.stopWorkspace,
    onSuccess: () => {
      // Invalidate workspace state query to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['workspaceState'] });
    },
    ...options,
  });
}

export function useSaveCanvas(options?: UseMutationOptions<any, Error, CanvasData>) {
  return useMutation({
    mutationFn: api.saveCanvas,
    onSuccess: () => {
      // Invalidate canvas backups query to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['canvasBackups'] });
    },
    ...options,
  });
}
