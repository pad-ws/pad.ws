import { useQuery, useMutation, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import { fetchApi } from './apiUtils';
import { queryClient } from './queryClient';

// Types
export interface WorkspaceState {
  status: 'running' | 'starting' | 'stopping' | 'stopped' | 'error';
  username: string | null;
  name: string | null;
  base_url: string | null;
  agent: string | null;
  id: string | null;
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

export interface PadData {
  id: string;
  owner_id: string;
  display_name: string;
  data: CanvasData;
  created_at: string;
  updated_at: string;
}

export interface CanvasBackup {
  id: number;
  timestamp: string;
  data: CanvasData;
}

export interface CanvasBackupsResponse {
  backups: CanvasBackup[];
  pad_name?: string;
}

export interface BuildInfo {
  buildHash: string;
  timestamp: number;
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
  
  // Canvas functions are now handled through getAllPads
  
  getAllPads: async (): Promise<PadData[]> => {
    try {
      const result = await fetchApi('/api/pad');
      return result;
    } catch (error) {
      throw error;
    }
  },
  
  saveCanvas: async (data: CanvasData): Promise<any> => {
    try {
      // Get the active pad ID from the global variable
      const activePadId = (window as any).activePadId;
      
      // We must have an active pad ID to save
      if (!activePadId) {
        throw new Error("No active pad ID found. Cannot save canvas.");
      }
      
      // Use the specific pad endpoint
      const endpoint = `/api/pad/${activePadId}`;
      
      const result = await fetchApi(endpoint, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return result;
    } catch (error) {
      throw error;
    }
  },
  
  renamePad: async (padId: string, newName: string): Promise<any> => {
    try {
      const endpoint = `/api/pad/${padId}`;
      const result = await fetchApi(endpoint, {
        method: 'PATCH',
        body: JSON.stringify({ display_name: newName }),
      });
      return result;
    } catch (error) {
      throw error;
    }
  },
  
  deletePad: async (padId: string): Promise<any> => {
    try {
      const endpoint = `/api/pad/${padId}`;
      const result = await fetchApi(endpoint, {
        method: 'DELETE',
      });
      return result;
    } catch (error) {
      throw error;
    }
  },
  
  getDefaultCanvas: async (): Promise<CanvasData> => {
    try {
      const result = await fetchApi('/api/templates/default');
      return result.data;
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
  
  getPadBackups: async (padId: string, limit: number = 10): Promise<CanvasBackupsResponse> => {
    try {
      const result = await fetchApi(`/api/pad/${padId}/backups?limit=${limit}`);
      return result;
    } catch (error) {
      throw error;
    }
  },
  
  // Build Info
  getBuildInfo: async (): Promise<BuildInfo> => {
    try {
      const result = await fetchApi('/api/app/build-info');
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

export function useAllPads(options?: UseQueryOptions<PadData[]>) {
  return useQuery({
    queryKey: ['allPads'],
    queryFn: api.getAllPads,
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

export function usePadBackups(padId: string | null, limit: number = 10, options?: UseQueryOptions<CanvasBackupsResponse>) {
  return useQuery({
    queryKey: ['padBackups', padId, limit],
    queryFn: () => padId ? api.getPadBackups(padId, limit) : Promise.reject('No pad ID provided'),
    enabled: !!padId, // Only run the query if padId is provided
    ...options,
  });
}

export function useBuildInfo(options?: UseQueryOptions<BuildInfo>) {
  return useQuery({
    queryKey: ['buildInfo'],
    queryFn: api.getBuildInfo,
    refetchInterval: 60000, // Check every minute
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
      // Get the active pad ID from the global variable
      const activePadId = (window as any).activePadId;
      
      // Invalidate canvas backups queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['canvasBackups'] });
      if (activePadId) {
        queryClient.invalidateQueries({ queryKey: ['padBackups', activePadId] });
      }
    },
    ...options,
  });
}

export function useRenamePad(options?: UseMutationOptions<any, Error, { padId: string, newName: string }>) {
  return useMutation({
    mutationFn: ({ padId, newName }) => api.renamePad(padId, newName),
    // No automatic invalidation - we'll update the cache manually
    ...options,
  });
}

export function useDeletePad(options?: UseMutationOptions<any, Error, string>) {
  return useMutation({
    mutationFn: (padId) => api.deletePad(padId),
    // No automatic invalidation - we'll update the cache manually
    ...options,
  });
}
