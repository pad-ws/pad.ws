import React, { useEffect, useState } from "react";
import { GithubIcon } from "../icons";
import "./GitHubButton.scss";

const GitHubButton: React.FC = () => {
  const [starCount, setStarCount] = useState<string | null>(null);

  useEffect(() => {
    // Fetch star count from GitHub API
    fetch("https://api.github.com/repos/pad-ws/pad.ws")
      .then(response => response.json())
      .then(data => {
        const stars = data.stargazers_count;
        
        // Format the star count with European number formatting (commas as thousand separators)
        let formattedStars;
        if (stars >= 1000) {
          // For numbers >= 1000, format with commas as thousand separators
          // e.g., 1000 -> 1,000, 1500 -> 1,500, etc.
          formattedStars = stars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        } else {
          // For numbers < 1000, just use the number as is
          formattedStars = stars.toString();
        }
        
        setStarCount(formattedStars);
      })
      .catch(error => {
        console.error("Error fetching GitHub stars:", error);
        setStarCount("--");
      });
  }, []);

  return (
    <button 
      className="github-button" 
      type="button" 
      onClick={() => window.open("https://github.com/pad-ws/pad.ws", "_blank")}
      aria-label="View on GitHub"
    >
      <GithubIcon 
        className="github-icon" 
        width={24} 
        height={24} 
        fill="#fff"
      />
      {starCount || "..."}
    </button>
  );
};

export default GitHubButton;
