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
    const { isAuthenticated, isLoading } = useAuthStatus();
    const [isConnected, setIsConnected] = useState(false);
    const currentPadIdRef = useRef<string | null>(null);

    const connect = useCallback(() => {
        // Don't connect if auth is still loading or requirements aren't met
        if (isLoading || !padId || !isAuthenticated) {
            if (wsRef.current) {
                wsRef.current.close();
                currentPadIdRef.current = null;
            }
            setIsConnected(false);
            return;
        }

        // Don't reconnect if already connected to same pad
        if (wsRef.current && currentPadIdRef.current === padId && wsRef.current.readyState === WebSocket.OPEN) {
            return () => {
                if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
                    wsRef.current.close();
                    currentPadIdRef.current = null;
                }
            };
        }

        // Close any existing connection before creating a new one
        if (wsRef.current) {
            wsRef.current.close();
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/pad/${padId}`;

        try {
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                setIsConnected(true);
                currentPadIdRef.current = padId;
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

            ws.onclose = () => {
                setIsConnected(false);
                if (wsRef.current === ws) {
                    wsRef.current = null;
                    currentPadIdRef.current = null;
                }
            };

            return () => {
                if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                    ws.close();
                    currentPadIdRef.current = null;
                }
            };
        } catch (error) {
            console.error('[pad.ws] Error creating WebSocket:', error);
            return () => { };
        }
    }, [padId, isAuthenticated, isLoading]);

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
        } else {
            console.warn(`[pad.ws] Cannot send message: WebSocket not connected`);
        }
    }, [padId]);

    return {
        sendMessage,
        isConnected
    };
};
