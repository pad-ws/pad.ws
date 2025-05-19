import { useCallback, useMemo, useEffect, useState } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { z } from 'zod';
import { useAuthStatus } from './useAuthStatus';

export const WebSocketMessageSchema = z.object({
    type: z.string(), // e.g., "connected", "user_joined", "user_left", "pad_update", "error"
    pad_id: z.string().nullable(),
    timestamp: z.string().datetime({ offset: true, message: "Invalid timestamp format" }),
    user_id: z.string().optional(),       // ID of the user related to the event or sending the message
    connection_id: z.string().optional(), // Connection ID related to the event or sending the message
    data: z.any().optional(),             // Payload; structure depends entirely on 'type'
});

// TypeScript type inferred from the Zod schema
export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000; // 1 second

// For user-friendly connection status
type ConnectionStatus = 'Uninstantiated' | 'Connecting' | 'Open' | 'Closing' | 'Closed' | 'Reconnecting' | 'Failed';

export const usePadWebSocket = (padId: string | null) => {
    const { isAuthenticated, isLoading, refetchAuthStatus, user } = useAuthStatus(); // Assuming user object has id
    const [isPermanentlyDisconnected, setIsPermanentlyDisconnected] = useState(false);
    const [reconnectAttemptCount, setReconnectAttemptCount] = useState(0);

    const getSocketUrl = useCallback((): string | null => {
        if (!padId || padId.startsWith('temp-')) {
            return null;
        }
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${window.location.host}/ws/pad/${padId}`;
        return url;
    }, [padId]);

    const memoizedSocketUrl = useMemo(() => getSocketUrl(), [getSocketUrl]);

    const shouldBeConnected = useMemo(() => {
        const conditionsMet = !!memoizedSocketUrl && isAuthenticated && !isLoading && !isPermanentlyDisconnected;
        return conditionsMet;
    }, [memoizedSocketUrl, isAuthenticated, isLoading, isPermanentlyDisconnected]);

    const {
        sendMessage: librarySendMessage,
        lastMessage: rawLastMessage,
        readyState,
    } = useWebSocket(
        memoizedSocketUrl,
        {
            onOpen: () => {
                console.debug(`[pad.ws] Connection established for pad: ${padId}`);
                setIsPermanentlyDisconnected(false);
                setReconnectAttemptCount(0);
            },
            onClose: (event: CloseEvent) => {
                console.debug(`[pad.ws] Connection closed for pad: ${padId}. Code: ${event.code}, Reason: '${event.reason}'`);
                if (isAuthenticated === undefined && !isLoading) {
                    console.debug('[pad.ws] Auth status unknown on close, attempting to refetch auth status.');
                    refetchAuthStatus();
                }
            },
            onError: (event: Event) => {
                console.error(`[pad.ws] WebSocket error for pad: ${padId}:`, event);
            },
            shouldReconnect: (closeEvent: CloseEvent) => {
                const isAbnormalClosure = closeEvent.code !== 1000 && closeEvent.code !== 1001;
                const conditionsStillMetForConnection = !!getSocketUrl() && isAuthenticated && !isLoading;

                if (isAbnormalClosure && !conditionsStillMetForConnection && isAuthenticated === undefined && !isLoading) {
                    console.debug(`[pad.ws] Abnormal closure for pad ${padId}, auth status unknown. Refetching auth before deciding on reconnect.`);
                    refetchAuthStatus();
                }
                
                const decision = isAbnormalClosure && conditionsStillMetForConnection && !isPermanentlyDisconnected;
                if (decision) {
                    setReconnectAttemptCount(prev => prev + 1);
                }
                console.debug(
                    `[pad.ws] shouldReconnect for pad ${padId}: ${decision} (Abnormal: ${isAbnormalClosure}, ConditionsMet: ${conditionsStillMetForConnection}, PermanentDisconnect: ${isPermanentlyDisconnected}, Code: ${closeEvent.code})`
                );
                return decision;
            },
            reconnectAttempts: MAX_RECONNECT_ATTEMPTS,
            reconnectInterval: (attemptNumber: number) => {
                const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, attemptNumber);
                console.debug(
                    `[pad.ws] Reconnecting attempt ${attemptNumber + 1}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms for pad: ${padId}`
                );
                return delay;
            },
            onReconnectStop: (numAttempts: number) => {
                console.warn(`[pad.ws] Failed to reconnect to pad ${padId} after ${numAttempts} attempts. Stopping.`);
                setIsPermanentlyDisconnected(true);
                setReconnectAttemptCount(numAttempts); // Store the final attempt count
            },
        },
        shouldBeConnected
    );

    const lastJsonMessage = useMemo((): WebSocketMessage | null => {
        if (rawLastMessage && rawLastMessage.data) {
            try {
                const parsedData = JSON.parse(rawLastMessage.data as string);
                const validationResult = WebSocketMessageSchema.safeParse(parsedData);
                if (validationResult.success) {
                    return validationResult.data;
                } else {
                    console.error(`[pad.ws] Incoming message validation failed for pad ${padId}:`, validationResult.error.issues);
                    console.error(`[pad.ws] Raw message: ${rawLastMessage.data}`);
                    return null;
                }
            } catch (error) {
                console.error(`[pad.ws] Error parsing incoming JSON message for pad ${padId}:`, error);
                return null;
            }
        }
        return null;
    }, [rawLastMessage, padId]);

    const sendJsonMessage = useCallback((payload: WebSocketMessage) => {
        const validationResult = WebSocketMessageSchema.safeParse(payload);
        if (!validationResult.success) {
            console.error(`[pad.ws] Outgoing message validation failed for pad ${padId}:`, validationResult.error.issues);
            return;
        }
        librarySendMessage(JSON.stringify(payload));
    }, [padId, librarySendMessage]);

    // Simplified sendMessage wrapper.
    // The 'type' parameter dictates the message type.
    // The 'data' parameter is the payload for the 'data' field in WebSocketMessage.
    const sendMessage = useCallback((type: string, messageData?: any) => {
        const messagePayload: WebSocketMessage = {
            type,
            pad_id: padId,
            timestamp: new Date().toISOString(), // Ensure ISO 8601 with Z or offset
            user_id: user?.id, // Add sender's user_id if available
            // connection_id is typically set by the server or known on connection,
            // client might not need to send it explicitly unless for specific cases.
            data: messageData,
        };
        
        console.debug(`[pad.ws] Sending message of type: ${messagePayload.type}`);
        sendJsonMessage(messagePayload);
    }, [padId, sendJsonMessage, user?.id]);

    useEffect(() => {
        if (lastJsonMessage) {
            console.debug(`[pad.ws] Received message of type: ${lastJsonMessage?.type}`);
        }
    }, [lastJsonMessage, padId]);

    const connectionStatus = useMemo((): ConnectionStatus => {
        if (isPermanentlyDisconnected) return 'Failed';
        
        switch (readyState) {
            case ReadyState.UNINSTANTIATED:
                return 'Uninstantiated';
            case ReadyState.CONNECTING:
                if (reconnectAttemptCount > 0 && reconnectAttemptCount < MAX_RECONNECT_ATTEMPTS && !isPermanentlyDisconnected) {
                    return 'Reconnecting';
                }
                return 'Connecting';
            case ReadyState.OPEN:
                return 'Open';
            case ReadyState.CLOSING:
                return 'Closing';
            case ReadyState.CLOSED:
                if (shouldBeConnected && reconnectAttemptCount > 0 && reconnectAttemptCount < MAX_RECONNECT_ATTEMPTS && !isPermanentlyDisconnected) {
                    return 'Reconnecting';
                }
                return 'Closed';
            default:
                return 'Uninstantiated';
        }
    }, [readyState, isPermanentlyDisconnected, reconnectAttemptCount, shouldBeConnected]);

    return {
        sendMessage,
        sendJsonMessage, // Kept for sending pre-formed WebSocketMessage objects
        lastJsonMessage,
        rawLastMessage,
        readyState,
        connectionStatus,
        isPermanentlyDisconnected,
    };
};
