import React from 'react';
import { NewPadIcon } from '../icons';
import './TabBar.scss';

interface Tab {
    id: string;
    label: string;
}

interface TabBarProps {
    tabs: Tab[];
    activeTabId: string;
    onTabSelect: (tabId: string) => void;
    onNewTab?: () => void;
}

const TabBar: React.FC<TabBarProps> = ({ tabs, activeTabId, onTabSelect, onNewTab }) => {
    return (
        <div className="tabs-bar">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    className={`tab${tab.id === activeTabId ? ' active-pad' : ''}`}
                    onClick={() => onTabSelect(tab.id)}
                >
                    {tab.label}
                </button>
            ))}
            {onNewTab && (
                <button
                    className="tab new-tab"
                    onClick={onNewTab}
                    title="New Pad"
                >
                    <NewPadIcon />
                </button>
            )}
        </div>
    );
};

export default TabBar; 