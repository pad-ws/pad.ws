import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { ExcalidrawImperativeAPI, AppState } from "@atyrode/excalidraw/types";
import type { ExcalidrawElement } from "@atyrode/excalidraw/element/types";
import { normalizeCanvasData } from '../lib/canvas';
import { defaultInitialData } from '../App';
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

export const usePad = (padId: string | null, excalidrawAPI: ExcalidrawImperativeAPI | null) => {
    const isTemporaryPad = padId?.startsWith('temp-');

    const { data, isLoading, error, isError } = useQuery<PadData, Error>({
        queryKey: ['pad', padId],
        queryFn: () => {
            if (!padId) throw new Error("padId is required");
            return fetchPadById(padId);
        },
        enabled: !!padId && !isTemporaryPad, 
    });

    useEffect(() => {
        if (isTemporaryPad && excalidrawAPI) {
            console.log(`[pad.ws] Initializing new temporary pad ${padId}`);
            excalidrawAPI.updateScene(defaultInitialData);
            return; 
        }

        if (data && excalidrawAPI && !isTemporaryPad) {
            const normalizedData = normalizeCanvasData(data);
            console.log(`[pad.ws] Loading pad ${padId}`);
            excalidrawAPI.updateScene(normalizedData);
        }
    }, [data, excalidrawAPI, padId, isTemporaryPad]);

    if (isTemporaryPad) {
        return {
            padData: defaultInitialData,
            isLoading: false,
            error: null,
            isError: false,
        };
    }

    return {
        padData: data,
        isLoading,
        error,
        isError
    };
};
