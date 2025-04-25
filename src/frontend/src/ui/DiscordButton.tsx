import React from "react";
import DiscordIcon from "../icons/DiscordIcon";

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
      <DiscordIcon 
        width={24} 
        height={24} 
        fill="#fff" 
        className="discord-icon"
      />
    </button>
  );
};

export default DiscordButton;
