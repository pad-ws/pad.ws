import posthog from 'posthog-js';
import { getAppConfig } from '../api/configService';

// Initialize PostHog with empty values first
posthog.init('', { api_host: '' });

// Then update with real values when config is loaded
getAppConfig().then(config => {
  if (config.posthogKey) {
    posthog.init(config.posthogKey, {
      api_host: config.posthogHost,
    });
    console.debug('[pad.ws] PostHog initialized successfully');
  } else {
    console.warn('[pad.ws] PostHog API key not found. Analytics will not be tracked.');
  }
});

// Helper function to track custom events
export const capture = (eventName: string, properties?: Record<string, any>) => {
  posthog.capture(eventName, properties);
};

// Export PostHog instance for direct use
export default posthog;
