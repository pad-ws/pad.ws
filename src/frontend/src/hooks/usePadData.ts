import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { ExcalidrawImperativeAPI, AppState } from "@atyrode/excalidraw/types";
import type { ExcalidrawElement } from "@atyrode/excalidraw/element/types";
import { normalizeCanvasData } from '../lib/canvas';

interface PadData {
    elements?: readonly ExcalidrawElement[];
    appState?: Pick<AppState, keyof AppState>;
    files?: Record<string, any>;
}

const fetchPadById = async (padId: string): Promise<PadData> => {
    const response = await fetch(`/api/pad/${padId}`);
    if (!response.ok) {
        let errorMessage = 'Failed to fetch pad data.';
        try {
            const errorData = await response.json();
            if (errorData && errorData.detail) {
                errorMessage = errorData.detail;
            }
        } catch (e) {
            // Ignore if error response is not JSON or empty
        }
        throw new Error(errorMessage);
    }
    return response.json();
};

export const usePad = (padId: string, excalidrawAPI: ExcalidrawImperativeAPI | null) => {
    const { data, isLoading, error, isError } = useQuery<PadData, Error>({
        queryKey: ['pad', padId],
        queryFn: () => fetchPadById(padId),
        enabled: !!padId, // Only run the query if padId is provided
    });

    useEffect(() => {
        if (data && excalidrawAPI) {
            const normalizedData = normalizeCanvasData(data);
            console.log(`[pad.ws] Loading pad ${padId}`);
            excalidrawAPI.updateScene(normalizedData);
        }
    }, [data, excalidrawAPI, padId]);

    return {
        padData: data,
        isLoading,
        error,
        isError
    };
}; 