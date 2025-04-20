// Common error handling for API responses
export async function handleResponse(response: Response) {
    if (!response.ok) {
      if (response.status === 401) {
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
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    
    return handleResponse(response);
  }