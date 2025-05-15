import { useQuery } from '@tanstack/react-query';

interface Tab {
    id: string;
    title: string;
    content: string;
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
        owner_id: string;
        display_name: string;
        data: any;
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
        content: JSON.stringify(pad.data),
        createdAt: pad.created_at,
        updatedAt: pad.updated_at
    }));

    return {
        tabs,
        activeTabId: tabs[0]?.id || ''
    };
};

export const usePadTabs = () => {
    const { data, isLoading, error, isError } = useQuery<PadResponse, Error>({
        queryKey: ['padTabs'],
        queryFn: fetchUserPads,
    });

    return {
        tabs: data?.tabs ?? [],
        activeTabId: data?.activeTabId,
        isLoading,
        error,
        isError
    };
}; 