import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';

export interface Tab {
    id: string;
    title: string;
    ownerId: string;
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
        owner_id: string;
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
        ownerId: pad.owner_id,
        createdAt: pad.created_at,
        updatedAt: pad.updated_at
    }));

    return {
        tabs,
        activeTabId: tabs[0]?.id || ''
    };
};

interface NewPadApiResponse {
    id: string;
    display_name: string;
    owner_id: string;
    created_at: string;
    updated_at: string;
}

const createNewPad = async (): Promise<Tab> => {
    const response = await fetch('/api/pad/new', {
        method: 'POST',
    });
    if (!response.ok) {
        let errorMessage = 'Failed to create new pad';
        try {
            const errorData = await response.json();
            if (errorData && errorData.detail) {
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
        ownerId: newPadResponse.owner_id,
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


    const createPadMutation = useMutation<Tab, Error, void, { previousTabsResponse?: PadResponse, tempTabId?: string }>({
        mutationFn: createNewPad,
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: ['padTabs'] });
            const previousTabsResponse = queryClient.getQueryData<PadResponse>(['padTabs']);

            const tempTabId = `temp-${Date.now()}`;
            const tempTab: Tab = {
                id: tempTabId,
                title: 'New pad',
                ownerId: '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            queryClient.setQueryData<PadResponse>(['padTabs'], (old) => {
                const newTabs = old ? [...old.tabs, tempTab] : [tempTab];
                return {
                    tabs: newTabs,
                    activeTabId: old?.activeTabId || tempTab.id, // Keep old active or use new if first
                };
            });
            setSelectedTabId(tempTabId);

            return { previousTabsResponse, tempTabId };
        },
        onError: (err, variables, context) => {
            if (context?.previousTabsResponse) {
                queryClient.setQueryData<PadResponse>(['padTabs'], context.previousTabsResponse);
            }
            // Revert selectedTabId if it was the temporary one
            if (selectedTabId === context?.tempTabId && context?.previousTabsResponse?.activeTabId) {
                setSelectedTabId(context.previousTabsResponse.activeTabId);
            } else if (selectedTabId === context?.tempTabId && context?.previousTabsResponse?.tabs && context.previousTabsResponse.tabs.length > 0) {
                setSelectedTabId(context.previousTabsResponse.tabs[0].id);
            } else if (selectedTabId === context?.tempTabId) {
                setSelectedTabId('');
            }
            // Optionally: display error to user
        },
        onSuccess: (newlyCreatedTab, variables, context) => {
            queryClient.setQueryData<PadResponse>(['padTabs'], (old) => {
                if (!old) return { tabs: [newlyCreatedTab], activeTabId: newlyCreatedTab.id };
                const newTabs = old.tabs.map(tab =>
                    tab.id === context?.tempTabId ? newlyCreatedTab : tab
                );
                // If the temp tab wasn't found (e.g., cache was cleared), add the new tab
                if (!newTabs.find(tab => tab.id === newlyCreatedTab.id)) {
                    newTabs.push(newlyCreatedTab);
                }
                return {
                    tabs: newTabs,
                    activeTabId: old.activeTabId === context?.tempTabId ? newlyCreatedTab.id : old.activeTabId,
                };
            });
            if (selectedTabId === context?.tempTabId) {
                setSelectedTabId(newlyCreatedTab.id);
            }
        },
        onSettled: () => {
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

    const renamePadMutation = useMutation<void, Error, { padId: string, newName: string }, { previousTabsResponse?: PadResponse, padId?: string, oldName?: string }>({
        mutationFn: renamePadAPI,
        onMutate: async ({ padId, newName }) => {
            await queryClient.cancelQueries({ queryKey: ['padTabs'] });
            const previousTabsResponse = queryClient.getQueryData<PadResponse>(['padTabs']);
            let oldName: string | undefined;

            queryClient.setQueryData<PadResponse>(['padTabs'], (old) => {
                if (!old) return undefined;
                const newTabs = old.tabs.map(tab => {
                    if (tab.id === padId) {
                        oldName = tab.title;
                        return { ...tab, title: newName, updatedAt: new Date().toISOString() };
                    }
                    return tab;
                });
                return { ...old, tabs: newTabs };
            });
            return { previousTabsResponse, padId, oldName };
        },
        onError: (err, variables, context) => {
            if (context?.previousTabsResponse) {
                queryClient.setQueryData<PadResponse>(['padTabs'], context.previousTabsResponse);
            }
            // Optionally: display error to user
        },
        onSettled: (data, error, variables, context) => {
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

    const deletePadMutation = useMutation<void, Error, string, { previousTabsResponse?: PadResponse, previousSelectedTabId?: string, deletedTab?: Tab }>({
        mutationFn: deletePadAPI, // padId is the variable passed to mutate
        onMutate: async (padIdToDelete) => {
            await queryClient.cancelQueries({ queryKey: ['padTabs'] });
            const previousTabsResponse = queryClient.getQueryData<PadResponse>(['padTabs']);
            const previousSelectedTabId = selectedTabId;
            let deletedTab: Tab | undefined;

            queryClient.setQueryData<PadResponse>(['padTabs'], (old) => {
                if (!old) return { tabs: [], activeTabId: '' };
                deletedTab = old.tabs.find(tab => tab.id === padIdToDelete);
                const newTabs = old.tabs.filter(tab => tab.id !== padIdToDelete);

                let newSelectedTabId = selectedTabId;
                if (selectedTabId === padIdToDelete) {
                    if (newTabs.length > 0) {
                        const currentIndex = old.tabs.findIndex(tab => tab.id === padIdToDelete);
                        newSelectedTabId = newTabs[Math.max(0, currentIndex - 1)]?.id || newTabs[0]?.id;
                    } else {
                        newSelectedTabId = '';
                    }
                    setSelectedTabId(newSelectedTabId);
                }

                return {
                    tabs: newTabs,
                    activeTabId: newSelectedTabId, // Update activeTabId in cache as well
                };
            });
            return { previousTabsResponse, previousSelectedTabId, deletedTab };
        },
        onError: (err, padId, context) => {
            if (context?.previousTabsResponse) {
                queryClient.setQueryData<PadResponse>(['padTabs'], context.previousTabsResponse);
            }
            if (context?.previousSelectedTabId) {
                setSelectedTabId(context.previousSelectedTabId);
            }
            // Optionally: display error to user
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['padTabs'] });
        },
    });

    const updateSharingPolicyAPI = async ({ padId, policy }: { padId: string, policy: string }): Promise<void> => {
        const response = await fetch(`/api/pad/${padId}/sharing`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ policy }),
        });
        if (!response.ok) {
            throw new Error('Failed to update sharing policy');
        }
    };

    const updateSharingPolicyMutation = useMutation<void, Error, { padId: string, policy: string }, { previousTabsResponse?: PadResponse }>({
        mutationFn: updateSharingPolicyAPI,
        onMutate: async ({ padId, policy }) => {
            await queryClient.cancelQueries({ queryKey: ['padTabs'] });
            const previousTabsResponse = queryClient.getQueryData<PadResponse>(['padTabs']);

            queryClient.setQueryData<PadResponse>(['padTabs'], (old) => {
                if (!old) return undefined;
                const newTabs = old.tabs.map(tab => {
                    if (tab.id === padId) {
                        return { ...tab, updatedAt: new Date().toISOString() };
                    }
                    return tab;
                });
                return { ...old, tabs: newTabs };
            });
            return { previousTabsResponse };
        },
        onError: (err, variables, context) => {
            if (context?.previousTabsResponse) {
                queryClient.setQueryData<PadResponse>(['padTabs'], context.previousTabsResponse);
            }
        },
        onSettled: () => {
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
        updateSharingPolicy: updateSharingPolicyMutation.mutate,
        isUpdatingSharingPolicy: updateSharingPolicyMutation.isPending,
        selectTab
    };
};
