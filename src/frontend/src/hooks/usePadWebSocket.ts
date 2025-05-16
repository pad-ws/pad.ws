import { useEffect, useRef, useCallback } from 'react';
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

    const connect = useCallback(() => {
        if (!padId || !user) return;

        // Close existing connection if any
        if (wsRef.current) {
            console.log(`[WebSocket] Closing connection to previous pad`);
            wsRef.current.close();
            wsRef.current = null;
        }

        // Determine WebSocket protocol based on current page protocol
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/pad/${padId}`);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log(`[WebSocket] Connected to pad ${padId}`);
        };

        ws.onmessage = (event) => {
            try {
                const message: WebSocketMessage = JSON.parse(event.data);
                console.log(`[WebSocket] Received message:`, message);

                // Handle different message types here
                switch (message.type) {
                    case 'connected':
                        console.log(`[WebSocket] Successfully connected to pad ${message.pad_id}`);
                        break;
                    case 'user_joined':
                        console.log(`[WebSocket] User ${message.user_id} joined pad ${message.pad_id}`);
                        break;
                    case 'user_left':
                        console.log(`[WebSocket] User ${message.user_id} left pad ${message.pad_id}`);
                        break;
                    case 'pad_update':
                        console.log(`[WebSocket] Pad ${message.pad_id} updated by user ${message.user_id}`);
                        break;
                    default:
                        // Default handler for any message type
                        console.log(`[WebSocket] Received ${message.type} message:`, {
                            pad_id: message.pad_id,
                            user_id: message.user_id,
                            timestamp: message.timestamp,
                            data: message.data
                        });
                }
            } catch (error) {
                console.error('[WebSocket] Error parsing message:', error);
            }
        };

        ws.onerror = (error) => {
            console.error('[WebSocket] Error:', error);
        };

        ws.onclose = () => {
            console.log(`[WebSocket] Disconnected from pad ${padId}`);
            wsRef.current = null;
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        };
    }, [padId, user]);

    // Connect when padId changes
    useEffect(() => {
        const cleanup = connect();
        return () => {
            cleanup?.();
        };
    }, [connect]);

    // Function to send messages through WebSocket
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
        isConnected: wsRef.current?.readyState === WebSocket.OPEN
    };
}; 