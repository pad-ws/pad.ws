import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';

interface Tab {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
}

interface PadResponse {
    tabs: Tab[];
    activeTabId: string;
}

interface UserResponse {
    username: string;
    email: string;
    email_verified: boolean;
    name: string;
    given_name: string;
    family_name: string;
    roles: string[];
    pads: {
        id: string;
        display_name: string;
        created_at: string;
        updated_at: string;
    }[];
}

const fetchUserPads = async (): Promise<PadResponse> => {
    const response = await fetch('/api/users/me');
    if (!response.ok) {
        let errorMessage = 'Failed to fetch user pads.';
        try {
            const errorData = await response.json();
            if (errorData && errorData.message) {
                errorMessage = errorData.message;
            }
        } catch (e) {
            // Ignore if error response is not JSON or empty
        }
        throw new Error(errorMessage);
    }
    const userData: UserResponse = await response.json();

    // Transform pads into tabs format
    const tabs = userData.pads.map(pad => ({
        id: pad.id,
        title: pad.display_name,
        createdAt: pad.created_at,
        updatedAt: pad.updated_at
    }));

    return {
        tabs,
        activeTabId: tabs[0]?.id || ''
    };
};

// Assuming the backend returns an object with these fields for a new pad
interface NewPadApiResponse {
    id: string;
    display_name: string;
    created_at: string;
    updated_at: string;
    // Potentially other fields like 'data' if the full pad object is returned
}

const createNewPad = async (): Promise<Tab> => { // Return type is Tab
    const response = await fetch('/api/pad/new', {
        method: 'POST',
    });
    if (!response.ok) {
        // Try to parse error message from backend
        let errorMessage = 'Failed to create new pad';
        try {
            const errorData = await response.json();
            if (errorData && errorData.detail) { // FastAPI often uses 'detail'
                errorMessage = errorData.detail;
            } else if (errorData && errorData.message) {
                errorMessage = errorData.message;
            }
        } catch (e) {
            // Ignore if error response is not JSON or empty
        }
        throw new Error(errorMessage);
    }
    const newPadResponse: NewPadApiResponse = await response.json();
    return {
        id: newPadResponse.id,
        title: newPadResponse.display_name,
        createdAt: newPadResponse.created_at,
        updatedAt: newPadResponse.updated_at,
    };
};

export const usePadTabs = () => {
    const queryClient = useQueryClient();
    const [selectedTabId, setSelectedTabId] = useState<string>('');

    const { data, isLoading, error, isError } = useQuery<PadResponse, Error>({
        queryKey: ['padTabs'],
        queryFn: fetchUserPads,
    });

    // Effect to manage tab selection based on data changes and selectedTabId validity
    useEffect(() => {
        if (isLoading) {
            return; 
        }

        if (data?.tabs && data.tabs.length > 0) {
            const isValidSelection = selectedTabId && data.tabs.some(tab => tab.id === selectedTabId);
            if (!isValidSelection) {
                setSelectedTabId(data.tabs[0].id);
            }
        } else if (data?.tabs && data.tabs.length === 0) {
            setSelectedTabId('');
        }
    }, [data, isLoading]);


    const createPadMutation = useMutation<Tab, Error, void>({ // Result: Tab, Error, Variables: void
        mutationFn: createNewPad, // createNewPad now returns Promise<Tab>
        onSuccess: (newlyCreatedTab) => {
            // Optimistically update the cache and select the new tab
            queryClient.setQueryData<PadResponse>(['padTabs'], (oldData) => {
                const newTabs = oldData ? [...oldData.tabs, newlyCreatedTab] : [newlyCreatedTab];
                // Determine the activeTabId for PadResponse. If oldData exists, use its activeTabId,
                // otherwise, it's the first fetch, so newTab is the one.
                // However, fetchUserPads sets activeTabId to tabs[0].id.
                // For consistency, let's mimic that or just ensure tabs are updated.
                const currentActiveId = oldData?.activeTabId || newlyCreatedTab.id;
                return {
                    tabs: newTabs,
                    activeTabId: currentActiveId // This might not be strictly necessary if selectedTabId drives UI
                };
            });
            setSelectedTabId(newlyCreatedTab.id);
            // Invalidate to ensure eventual consistency with the backend
            queryClient.invalidateQueries({ queryKey: ['padTabs'] });
        },
    });

    const renamePadAPI = async ({ padId, newName }: { padId: string, newName: string }): Promise<void> => {
        const response = await fetch(`/api/pad/${padId}/rename`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ display_name: newName }),
        });
        if (!response.ok) {
            throw new Error('Failed to rename pad');
        }
    };

    const renamePadMutation = useMutation({
        mutationFn: renamePadAPI,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['padTabs'] });
        },
    });

    const deletePadAPI = async (padId: string): Promise<void> => {
        const response = await fetch(`/api/pad/${padId}`, {
            method: 'DELETE',
        });
        if (!response.ok) {
            throw new Error('Failed to delete pad');
        }
    };

    const deletePadMutation = useMutation({
        mutationFn: deletePadAPI,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['padTabs'] });
        },
    });

    const selectTab = async (tabId: string) => {
        setSelectedTabId(tabId);
    };

    return {
        tabs: data?.tabs ?? [],
        selectedTabId: selectedTabId || data?.activeTabId || '',
        isLoading,
        error,
        isError,
        createNewPad: createPadMutation.mutate, // Standard mutate for fire-and-forget
        createNewPadAsync: createPadMutation.mutateAsync, // For components needing the result
        isCreating: createPadMutation.isPending,
        renamePad: renamePadMutation.mutate,
        isRenaming: renamePadMutation.isPending,
        deletePad: deletePadMutation.mutate,
        isDeleting: deletePadMutation.isPending,
        selectTab
    };
};
