import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthStatus } from './useAuthStatus';

interface WebSocketMessage {
    type: string;
    pad_id: string;
    data: any;
    timestamp: string;
    user_id?: string;
}

// WebSocket connection states
enum ConnectionState {
    DISCONNECTED = 'disconnected',
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    RECONNECTING = 'reconnecting'
}

// Connection state object to consolidate multiple refs
interface ConnectionStateRef {
    ws: WebSocket | null;
    reconnectTimeout: NodeJS.Timeout | null;
    reconnectAttempts: number;
    currentPadId: string | null;
}

export const usePadWebSocket = (padId: string | null) => {
    const { isAuthenticated, isLoading } = useAuthStatus();
    const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);

    // Consolidated connection state
    const connStateRef = useRef<ConnectionStateRef>({
        ws: null,
        reconnectTimeout: null,
        reconnectAttempts: 0,
        currentPadId: null
    });

    const MAX_RECONNECT_ATTEMPTS = 5;
    const INITIAL_RECONNECT_DELAY = 1000; // 1 second

    // Clear any reconnect timeout
    const clearReconnectTimeout = useCallback(() => {
        if (connStateRef.current.reconnectTimeout) {
            clearTimeout(connStateRef.current.reconnectTimeout);
            connStateRef.current.reconnectTimeout = null;
        }
    }, []);

    // Reset connection state
    const resetConnection = useCallback(() => {
        clearReconnectTimeout();
        connStateRef.current.reconnectAttempts = 0;
        connStateRef.current.currentPadId = null;
        setConnectionState(ConnectionState.DISCONNECTED);
    }, [clearReconnectTimeout]);

    // Function to create and setup a WebSocket connection
    const createWebSocket = useCallback((url: string, isReconnecting: boolean) => {
        const ws = new WebSocket(url);
        connStateRef.current.ws = ws;

        setConnectionState(isReconnecting ? ConnectionState.RECONNECTING : ConnectionState.CONNECTING);

        ws.onopen = () => {
            console.log(`[pad.ws] Connection established to pad ${padId}`);
            setConnectionState(ConnectionState.CONNECTED);
            connStateRef.current.currentPadId = padId;
            connStateRef.current.reconnectAttempts = 0;
        };

        ws.onmessage = (event) => {
            try {
                const message: WebSocketMessage = JSON.parse(event.data);
                // Process message if needed
            } catch (error) {
                console.error('[pad.ws] Error parsing message:', error);
            }
        };

        ws.onerror = (error) => {
            console.error('[pad.ws] WebSocket error:', error);
        };

        ws.onclose = (event) => {
            console.log(`[pad.ws] Connection closed with code ${event.code}`);
            setConnectionState(ConnectionState.DISCONNECTED);

            if (connStateRef.current.ws === ws) {
                connStateRef.current.ws = null;

                // Only attempt to reconnect if it wasn't a normal closure and we have a pad ID
                const isAbnormalClosure = event.code !== 1000 && event.code !== 1001;
                if (padId && isAbnormalClosure && connStateRef.current.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    attemptReconnect();
                } else if (!isAbnormalClosure) {
                    resetConnection();
                }
            }
        };

        return ws;
    }, [padId, resetConnection]);

    // Attempt to reconnect with exponential backoff
    const attemptReconnect = useCallback(() => {
        clearReconnectTimeout();

        // Safety check if we've reached max attempts
        if (connStateRef.current.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.warn('[pad.ws] Max reconnect attempts reached');
            resetConnection();
            return;
        }

        // Calculate delay with exponential backoff
        const attempt = connStateRef.current.reconnectAttempts + 1;
        const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, connStateRef.current.reconnectAttempts);
        console.info(`[pad.ws] Reconnecting in ${delay}ms (attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS})`);

        // Increment counter before scheduling reconnect
        connStateRef.current.reconnectAttempts = attempt;

        // Schedule reconnect
        connStateRef.current.reconnectTimeout = setTimeout(() => {
            connectWebSocket(true);
        }, delay);
    }, [clearReconnectTimeout, resetConnection]);

    // Core connection function
    const connectWebSocket = useCallback((isReconnecting = false) => {
        // Check if we can/should connect
        const canConnect = isAuthenticated && !isLoading && padId;
        if (!canConnect) {
            // Clean up existing connection if we can't connect now
            if (connStateRef.current.ws) {
                connStateRef.current.ws.close();
                connStateRef.current.ws = null;
            }
            setConnectionState(ConnectionState.DISCONNECTED);

            // Preserve reconnection sequence if needed
            if (isReconnecting &&
                connStateRef.current.reconnectAttempts > 0 &&
                connStateRef.current.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                console.log(`[pad.ws] Can't connect now but preserving reconnection sequence, scheduling next attempt`);
                attemptReconnect();
            }
            return;
        }

        // Don't reconnect if already connected to same pad
        if (connStateRef.current.ws &&
            connStateRef.current.currentPadId === padId &&
            connStateRef.current.ws.readyState === WebSocket.OPEN) {
            return;
        }

        console.log(`[pad.ws] ${isReconnecting ? 'Re' : ''}Connecting to pad ${padId} (attempt ${isReconnecting ? connStateRef.current.reconnectAttempts : 0}/${MAX_RECONNECT_ATTEMPTS})`);

        // Close any existing connection before creating a new one
        if (connStateRef.current.ws) {
            connStateRef.current.ws.close();
        }

        // Create the WebSocket URL
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/pad/${padId}`;

        try {
            createWebSocket(wsUrl, isReconnecting);
        } catch (error) {
            console.error('[pad.ws] Error creating WebSocket:', error);
            attemptReconnect();
        }
    }, [padId, isAuthenticated, isLoading, createWebSocket, attemptReconnect]);

    // Connect when dependencies change
    useEffect(() => {
        connectWebSocket(false);

        // Cleanup function - preserve reconnection attempts
        return () => {
            if (connStateRef.current.ws) {
                // Only close if this is a normal unmount, not a reconnection attempt
                if (connStateRef.current.reconnectAttempts === 0) {
                    connStateRef.current.ws.close();
                    connStateRef.current.currentPadId = null;
                } else {
                    console.log(`[pad.ws] Component unmounting but preserving connection attempt ${connStateRef.current.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
                }
            }
            // Only clear the timeout, don't reset the counter or close active reconnection attempts
            clearReconnectTimeout();
        };
    }, [connectWebSocket, clearReconnectTimeout]);

    // Check if we're connected
    const isConnected = connectionState === ConnectionState.CONNECTED;

    // Send message over WebSocket
    const sendMessage = useCallback((type: string, data: any) => {
        if (connStateRef.current.ws?.readyState === WebSocket.OPEN) {
            connStateRef.current.ws.send(JSON.stringify({
                type,
                pad_id: padId,
                data,
                timestamp: new Date().toISOString()
            }));
            return true;
        }
        console.warn(`[pad.ws] Cannot send message: WebSocket not connected - changes will not be saved`);
        return false;
    }, [padId]);

    return {
        sendMessage,
        isConnected
    };
};
