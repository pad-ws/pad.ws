import { fetchApi } from './apiUtils';

/**
 * Application configuration interface
 */
export interface AppConfig {
  coderUrl: string;
  posthogKey: string;
  posthogHost: string;
}

// Cache the config to avoid unnecessary API calls
let cachedConfig: AppConfig | null = null;

/**
 * Get the application configuration from the API
 * @returns The application configuration
 */
export async function getAppConfig(): Promise<AppConfig> {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }
  
  try {
    // Fetch config from API
    const config = await fetchApi('/api/app/config');
    cachedConfig = config;
    return config;
  } catch (error) {
    console.error('[pad.ws] Failed to load application configuration:', error);
    // Return default values as fallback
    return {
      coderUrl: '',
      posthogKey: '',
      posthogHost: ''
    };
  }
}
