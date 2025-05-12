import posthog from 'posthog-js';

// Initialize PostHog with empty values first
posthog.init('', { api_host: '' });

const config = { //TODO
  posthogKey: 'phc_RBmyKvfGVKCpPYkSFV2U2oAFWxwEKrDQzHmnKXPmodf',
  posthogHost: 'https://eu.i.posthog.com'
}

// Then update with real values when config is loaded
posthog.init(config.posthogKey, {
  api_host: config.posthogHost,
});
console.debug('[pad.ws] PostHog initialized successfully');

// Helper function to track custom events
export const capture = (eventName: string, properties?: Record<string, any>) => {
  posthog.capture(eventName, properties);
};

// Export PostHog instance for direct use
export default posthog;
