import { useCallback, useMemo, useEffect, useState } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { z } from 'zod'; // Import Zod
import { useAuthStatus } from './useAuthStatus';

// 1. Define Zod Schema for your WebSocketMessage
// Adjust the 'data' part of the schema based on the actual structure of your messages.
// Using z.any() for data is a placeholder; more specific schemas are better.
// If 'data' can have different structures based on 'type', consider Zod's discriminated unions.
const WebSocketMessageSchema = z.object({
    type: z.string(),
    pad_id: z.string().nullable(),
    data: z.any().optional(), // Make 'data' optional
    timestamp: z.string().datetime({ offset: true, precision: 6, message: "Invalid timestamp format, expected ISO 8601 with offset and 6 fractional seconds" }).optional(),
    user_id: z.string().optional(),
});

// Type inferred from the Zod schema
type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000; // 1 second

// For user-friendly connection status
type ConnectionStatus = 'Uninstantiated' | 'Connecting' | 'Open' | 'Closing' | 'Closed' | 'Reconnecting' | 'Failed';

export const usePadWebSocket = (padId: string | null) => {
    const { isAuthenticated, isLoading, refetchAuthStatus } = useAuthStatus();
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
    }, [memoizedSocketUrl, isAuthenticated, isLoading, isPermanentlyDisconnected, padId]);

    const {
        sendMessage: librarySendMessage,
        lastMessage: rawLastMessage,
        readyState,
    } = useWebSocket(
        memoizedSocketUrl,
        {
            onOpen: () => {
                console.log(`[pad.ws] Connection established for pad: ${padId}`);
                setIsPermanentlyDisconnected(false);
                setReconnectAttemptCount(0);
            },
            onClose: (event: CloseEvent) => {
                console.log(`[pad.ws] Connection closed for pad: ${padId}. Code: ${event.code}, Reason: '${event.reason}'`);
                if (isAuthenticated === undefined && !isLoading) {
                    console.log('[pad.ws] Auth status unknown on close, attempting to refetch auth status.');
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
                    console.log('[pad.ws] Abnormal closure for pad ${padId}, auth status unknown. Refetching auth before deciding on reconnect.');
                    refetchAuthStatus();
                }
                
                const decision = isAbnormalClosure && conditionsStillMetForConnection && !isPermanentlyDisconnected;
                if (decision) {
                    setReconnectAttemptCount(prev => prev + 1);
                }
                console.log(
                    `[pad.ws] shouldReconnect for pad ${padId}: ${decision} (Abnormal: ${isAbnormalClosure}, ConditionsMet: ${conditionsStillMetForConnection}, PermanentDisconnect: ${isPermanentlyDisconnected}, Code: ${closeEvent.code})`
                );
                return decision;
            },
            reconnectAttempts: MAX_RECONNECT_ATTEMPTS,
            reconnectInterval: (attemptNumber: number) => {
                const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, attemptNumber);
                console.info(
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
        // Validate outgoing message structure (optional, but good practice)
        const validationResult = WebSocketMessageSchema.safeParse(payload);
        if (!validationResult.success) {
            console.error(`[pad.ws] Outgoing message validation failed for pad ${padId}:`, validationResult.error.issues);
            // Decide if you want to throw an error or just log and not send
            return;
        }

        librarySendMessage(JSON.stringify(payload));
    }, [padId, librarySendMessage]);

    // Wrapper to maintain the original `sendMessage(type, data)` signature if preferred by consuming components
    const sendMessage = useCallback((type: string, data: any) => {
        const messagePayload: WebSocketMessage = {
            type,
            pad_id: padId,
            data,
            timestamp: new Date().toISOString(),
            // user_id: can be added here if available and needed from context
        };
        console.debug(`[pad.ws] Sending message`, messagePayload.type);
        sendJsonMessage(messagePayload);
    }, [padId, sendJsonMessage]);

    useEffect(() => {
        if (lastJsonMessage) {
            // console.debug(`[pad.ws] Validated JSON message received for pad ${padId}:`, lastJsonMessage);
            console.debug(`[pad.ws] Received message`, lastJsonMessage?.type);
            // TODO: Dispatch to a store, update context, or trigger other side effects based on the message
        }
    }, [lastJsonMessage, padId]);

    const connectionStatus = useMemo((): ConnectionStatus => {
        if (isPermanentlyDisconnected) return 'Failed';
        
        switch (readyState) {
            case ReadyState.UNINSTANTIATED:
                return 'Uninstantiated';
            case ReadyState.CONNECTING:
                // Differentiate between initial connecting and reconnecting
                if (reconnectAttemptCount > 0 && reconnectAttemptCount < MAX_RECONNECT_ATTEMPTS && !isPermanentlyDisconnected) {
                    return 'Reconnecting';
                }
                return 'Connecting';
            case ReadyState.OPEN:
                return 'Open';
            case ReadyState.CLOSING:
                return 'Closing';
            case ReadyState.CLOSED:
                 // If it's closed but not permanently, and shouldBeConnected is true, it might be about to reconnect
                if (shouldBeConnected && reconnectAttemptCount > 0 && reconnectAttemptCount < MAX_RECONNECT_ATTEMPTS && !isPermanentlyDisconnected) {
                    return 'Reconnecting';
                }
                return 'Closed';
            default:
                return 'Uninstantiated';
        }
    }, [readyState, isPermanentlyDisconnected, reconnectAttemptCount, shouldBeConnected]);

    return {
        sendMessage, // Original simple signature
        sendJsonMessage, // For sending pre-formed WebSocketMessage objects
        lastJsonMessage, // Validated JSON message
        rawLastMessage,  // Raw message, for debugging or non-JSON cases
        readyState,      // Numerical readyState
        connectionStatus,// User-friendly status string
        isPermanentlyDisconnected,
    };
};
