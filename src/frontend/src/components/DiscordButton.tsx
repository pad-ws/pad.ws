import React from "react";

const DISCORD_URL = "https://discord.gg/NnXSESxWpA";

const DiscordButton: React.FC = () => {
  const handleClick = () => {
    window.open(DISCORD_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <button
      className="discord-button"
      onClick={handleClick}
      aria-label="Join Discord"
      type="button"
      style={{ padding: 0, width: "2.5rem" }}
    >
      <svg
        aria-hidden="true"
        focusable="false"
        role="img"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        width="24"
        height="24"
        style={{ display: "block", margin: "0 auto", stroke: "#fff" }}
      >
        <g strokeWidth="1.25">
          <path d="M7.5 10.833a.833.833 0 1 0 0-1.666.833.833 0 0 0 0 1.666ZM12.5 10.833a.833.833 0 1 0 0-1.666.833.833 0 0 0 0 1.666ZM6.25 6.25c2.917-.833 4.583-.833 7.5 0M5.833 13.75c2.917.833 5.417.833 8.334 0"></path>
          <path d="M12.917 14.167c0 .833 1.25 2.5 1.666 2.5 1.25 0 2.361-1.39 2.917-2.5.556-1.39.417-4.861-1.25-9.584-1.214-.846-2.5-1.116-3.75-1.25l-.833 2.084M7.083 14.167c0 .833-1.13 2.5-1.526 2.5-1.191 0-2.249-1.39-2.778-2.5-.529-1.39-.397-4.861 1.19-9.584 1.157-.846 2.318-1.116 3.531-1.25l.833 2.084"></path>
        </g>
      </svg>
    </button>
  );
};

export default DiscordButton;
