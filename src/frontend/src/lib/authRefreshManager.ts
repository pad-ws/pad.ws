// Auth refresh singleton manager
interface UserInfo {
    username?: string;
    email?: string;
    name?: string;
}

interface AuthStatusResponse {
    authenticated: boolean;
    user?: UserInfo;
    expires_in?: number;
    message?: string;
}

// Refresh API function
const refreshAuth = async (): Promise<AuthStatusResponse> => {
    const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
    });
    if (!response.ok) {
        throw new Error('Failed to refresh session');
    }
    return response.json();
};

// Singleton state
let refreshTimer: NodeJS.Timeout | null = null;
let isRefreshScheduled = false;

/**
 * Schedule a token refresh operation.
 * Only one refresh will be scheduled at a time across the application.
 */
export const scheduleTokenRefresh = (
    expiresIn: number,
    onRefresh: (data: AuthStatusResponse) => void,
    onError: (err: Error) => void
): void => {
    // Don't schedule if already scheduled
    if (isRefreshScheduled) {
        return;
    }

    const msUntilExpiry = expiresIn * 1000;
    const refreshTime = msUntilExpiry - (5 * 60 * 1000); // 5 minutes before expiry

    // Don't schedule if token expires too soon
    if (refreshTime <= 0) {
        return;
    }

    isRefreshScheduled = true;

    // Clear any existing timer first
    if (refreshTimer) {
        clearTimeout(refreshTimer);
    }

    // Set up new timer
    refreshTimer = setTimeout(async () => {
        try {
            const refreshData = await refreshAuth();
            onRefresh(refreshData);
            isRefreshScheduled = false;
        } catch (err) {
            console.error('[pad.ws] Auth refresh failed:', err);
            onError(err instanceof Error ? err : new Error(String(err)));
            isRefreshScheduled = false;
        }
    }, refreshTime);
};

/**
 * Cancel any scheduled token refresh
 */
export const cancelTokenRefresh = (): void => {
    if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
    }
    isRefreshScheduled = false;
};

// Export auth status query key for consistency
export const AUTH_STATUS_KEY = 'authStatus'; 