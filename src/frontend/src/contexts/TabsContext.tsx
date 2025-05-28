import React, { createContext, useContext, ReactNode } from 'react';
import {
    usePadTabs,
    Tab,
} from '../hooks/usePadTabs';

export interface PadTabsContextType {
    tabs: Tab[];
    selectedTabId: string;
    isLoading: boolean;
    error: Error | null;
    isError: boolean;
    createNewPadAsync: () => Promise<Tab | undefined>;
    isCreating: boolean;
    renamePad: (args: { padId: string; newName: string }) => void;
    isRenaming: boolean;
    deletePad: (padId: string) => void;
    isDeleting: boolean;
    leaveSharedPad: (padId: string) => void;
    isLeavingSharedPad: boolean;
    updateSharingPolicy: (args: { padId: string; policy: string }) => void;
    isUpdatingSharingPolicy: boolean;
    selectTab: (tabId: string) => void;
}

export const PadTabsContext = createContext<PadTabsContextType | undefined>(undefined);

export const PadTabsProvider: React.FC<{ children: ReactNode; isAuthenticated?: boolean }> = ({ children, isAuthenticated }) => {
    const padTabsData = usePadTabs(isAuthenticated);

    const contextValue: PadTabsContextType = {
        tabs: padTabsData.tabs,
        selectedTabId: padTabsData.selectedTabId,
        isLoading: padTabsData.isLoading,
        error: padTabsData.error,
        isError: padTabsData.isError,
        createNewPadAsync: padTabsData.createNewPadAsync,
        isCreating: padTabsData.isCreating,
        renamePad: padTabsData.renamePad,
        isRenaming: padTabsData.isRenaming,
        deletePad: padTabsData.deletePad,
        isDeleting: padTabsData.isDeleting,
        leaveSharedPad: padTabsData.leaveSharedPad,
        isLeavingSharedPad: padTabsData.isLeavingSharedPad,
        updateSharingPolicy: padTabsData.updateSharingPolicy,
        isUpdatingSharingPolicy: padTabsData.isUpdatingSharingPolicy,
        selectTab: padTabsData.selectTab,
    };
    return (
        <PadTabsContext.Provider value={contextValue}>
            {children}
        </PadTabsContext.Provider>
    );
};

export const usePadTabsContext = (): PadTabsContextType => {
    const context = useContext(PadTabsContext);
    if (context === undefined) {
        throw new Error('usePadTabsContext must be used within a PadTabsProvider');
    }
    return context;
};
