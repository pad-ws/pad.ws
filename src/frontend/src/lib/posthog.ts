import posthog from 'posthog-js';

let isPostHogInitialized = false;

interface PostHogConfigKeys {
  posthogKey: string;
  posthogHost: string;
}

export const initializePostHog = (config: PostHogConfigKeys) => {
  if (isPostHogInitialized) {
    console.warn('[pad.ws] PostHog is already initialized. Skipping re-initialization.');
    return;
  }
  if (!config || !config.posthogKey || !config.posthogHost) {
    console.warn('[pad.ws] PostHog initialization skipped due to missing or invalid config.');
    return;
  }

  try {
    posthog.init(config.posthogKey, {
      api_host: config.posthogHost,
    });
    isPostHogInitialized = true;
    console.debug('[pad.ws] PostHog initialized successfully from posthog.ts with config:', config);
  } catch (error) {
    console.error('[pad.ws] Error initializing PostHog:', error);
  }
};

export const capture = (eventName: string, properties?: Record<string, any>) => {
  if (!isPostHogInitialized) {
    console.warn(`[pad.ws] PostHog not yet initialized. Event "${eventName}" was not captured.`);
    return;
  }
  posthog.capture(eventName, properties);
};

export default posthog;
