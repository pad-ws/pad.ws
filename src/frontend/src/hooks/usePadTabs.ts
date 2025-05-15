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

const createNewPad = async (): Promise<void> => {
    const response = await fetch('/api/pad/new', {
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error('Failed to create new pad');
    }
};

export const usePadTabs = () => {
    const queryClient = useQueryClient();
    const [selectedTabId, setSelectedTabId] = useState<string>('');

    const { data, isLoading, error, isError } = useQuery<PadResponse, Error>({
        queryKey: ['padTabs'],
        queryFn: fetchUserPads
    });

    // Set initial selected tab when data is loaded
    useEffect(() => {
        if (data?.tabs.length && !selectedTabId) {
            setSelectedTabId(data.tabs[0].id);
        }
    }, [data, selectedTabId]);

    const createPadMutation = useMutation({
        mutationFn: createNewPad,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['padTabs'] });
        },
    });

    const selectTab = async (tabId: string) => {
        setSelectedTabId(tabId);
        try {
            const response = await fetch(`/api/pad/${tabId}`);
            if (!response.ok) {
                throw new Error('Failed to fetch pad data');
            }
            const padData = await response.json();
            queryClient.setQueryData(['pad', tabId], padData);
        } catch (error) {
            console.error('Error fetching pad data:', error);
        }
    };

    return {
        tabs: data?.tabs ?? [],
        selectedTabId: selectedTabId || data?.activeTabId || '',
        isLoading,
        error,
        isError,
        createNewPad: createPadMutation.mutate,
        isCreating: createPadMutation.isPending,
        selectTab
    };
}; 