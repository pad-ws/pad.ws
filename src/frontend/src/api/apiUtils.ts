import { queryClient } from './queryClient';

/**
 * Handle unauthorized errors by updating the auth state in the query cache
 * This will trigger the AuthModal to appear
 */
export function handleUnauthorized() {
  // Set auth state to false to trigger the AuthModal
  queryClient.setQueryData(['auth'], false);
}

// Common error handling for API responses
export async function handleResponse(response: Response) {
  if (!response.ok) {
    if (response.status === 401) {
      // Update auth state when 401 is encountered
      handleUnauthorized();
      throw new Error('Unauthorized');
    }
    
    const errorText = await response.text();
    throw new Error(errorText || `API error: ${response.status}`);
  }
  
  // For endpoints that return no content
  if (response.status === 204) {
    return null;
  }
  
  // For endpoints that return JSON
  return response.json();
}

// Base fetch function with error handling
export async function fetchApi(url: string, options?: RequestInit) {
  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    
    return handleResponse(response);
  } catch (error) {
    // Re-throw the error after handling it
    throw error;
  }
}
