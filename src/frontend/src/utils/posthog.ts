import posthog from 'posthog-js';

// Initialize PostHog
if (import.meta.env.VITE_PUBLIC_POSTHOG_KEY) {
  posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
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