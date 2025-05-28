import React from "react";

interface NewPadIconProps {
    className?: string;
    width?: number;
    height?: number;
}

export const NewPadIcon: React.FC<NewPadIconProps> = ({
    className = "",
    width = 20,
    height = 20,
}) => {
    return (
        <svg
            className={className}
            width={width}
            height={height}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
    );
};

export default NewPadIcon; 