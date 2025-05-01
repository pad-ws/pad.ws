import posthog from 'posthog-js';

const posthogKey = window.RUNTIME_CONFIG?.VITE_PUBLIC_POSTHOG_KEY || import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const posthogHost = window.RUNTIME_CONFIG?.VITE_PUBLIC_POSTHOG_HOST || import.meta.env.VITE_PUBLIC_POSTHOG_HOST;

// Initialize PostHog
if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
  });
  console.debug('[pad.ws] PostHog initialized successfully');
} else {
  console.warn('[pad.ws] PostHog API key not found. Analytics will not be tracked.');
}

// Helper function to track custom events
export const capture = (eventName: string, properties?: Record<string, any>) => {
  posthog.capture(eventName, properties);
};

// Export PostHog instance for direct use
export default posthog;