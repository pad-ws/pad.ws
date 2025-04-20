import posthog from 'posthog-js';

// Initialize PostHog
if (import.meta.env.VITE_PUBLIC_POSTHOG_KEY) {
  posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    persistence: 'localStorage',
    debug: false,
  });
  console.debug('PostHog initialized successfully');
} else {
  console.warn('PostHog API key not found. Analytics will not be tracked.');
}

// Helper function to track custom events
export const capture = (eventName: string, properties?: Record<string, any>) => {
  posthog.capture(eventName, properties);
};

// Export PostHog instance for direct use
export default posthog;
