import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthStatus } from './useAuthStatus';

interface WebSocketMessage {
    type: string;
    pad_id: string;
    data: any;
    timestamp: string;
    user_id?: string;
}

export const usePadWebSocket = (padId: string | null) => {
    const wsRef = useRef<WebSocket | null>(null);
    const { user } = useAuthStatus();
    const [isConnected, setIsConnected] = useState(false);

    const connect = useCallback(() => {
        if (!padId || !user) {
            // Ensure any existing connection is closed if padId becomes null or user logs out
            if (wsRef.current) {
                wsRef.current.close();
                // wsRef.current = null; // Let onclose handle this
            }
            setIsConnected(false); // Explicitly set to false
            return;
        }

        // Close existing connection if any (from a *different* padId)
        if (wsRef.current && !wsRef.current.url.endsWith(padId)) {
            wsRef.current.close();
            // wsRef.current = null; // Let onclose handle setting wsRef.current to null
        } else if (wsRef.current && wsRef.current.url.endsWith(padId)) {
            // Already connected or connecting to the same padId, do nothing.
            // The useEffect dependency on `connect` (which depends on `padId`) handles this.
            return () => { // Return the existing cleanup if we're not making a new ws
                if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
                    // This is tricky, if connect is called but we don't make a new ws,
                    // what cleanup should be returned? The one for the existing ws.
                    // However, this path should ideally not be hit if deps are correct.
                    // For safety, we can return a no-op or the existing ws's close.
                }
            };
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/pad/${padId}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log(`[pad.ws] Connected to pad ${padId}`);
            setIsConnected(true);
        };

        ws.onmessage = (event) => {
            try {
                const message: WebSocketMessage = JSON.parse(event.data);
                console.log(`[pad.ws] Received message:`, message);

                switch (message.type) {
                    case 'connected':
                        console.log(`[pad.ws] Successfully connected to pad ${message.pad_id}`);
                        break;
                    case 'user_joined':
                        console.log(`[pad.ws] User ${message.user_id} joined pad ${message.pad_id}`);
                        break;
                    case 'user_left':
                        console.log(`[pad.ws] User ${message.user_id} left pad ${message.pad_id}`);
                        break;
                    case 'pad_update':
                        console.log(`[pad.ws] Pad ${message.pad_id} updated by user ${message.user_id}`);
                        break;
                    default:
                        // Default handler for any message type
                        console.log(`[pad.ws] Received ${message.type} message:`, {
                            pad_id: message.pad_id,
                            user_id: message.user_id,
                            timestamp: message.timestamp,
                            data: message.data
                        });
                }
            } catch (error) {
                console.error('[pad.ws] Error parsing message:', error);
            }
        };

        ws.onerror = (error) => {
            console.error('[pad.ws] Error:', error);
        };

        ws.onclose = () => {
            console.log(`[pad.ws] Disconnected from pad ${padId}`);
            setIsConnected(false);
            if (wsRef.current === ws) {
                wsRef.current = null;
            }
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
            }
        };
    }, [padId, user]);

    useEffect(() => {
        const cleanup = connect();
        return () => {
            cleanup?.();
        };
    }, [connect]);

    const sendMessage = useCallback((type: string, data: any) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type,
                pad_id: padId,
                data,
                timestamp: new Date().toISOString()
            }));
        }
    }, [padId]);

    return {
        sendMessage,
        isConnected
    };
};
