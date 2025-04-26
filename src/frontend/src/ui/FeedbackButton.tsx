import React from "react";
import { capture } from "../utils/posthog";
import "./FeedbackButton.scss";

const FeedbackButton: React.FC = () => {
  const handleClick = () => {
    capture("feedback_request");
  };

  return (
    <button
      onClick={handleClick}
      className="feedback-button"
      aria-label="Send Feedback"
    >
      Feedback
    </button>
  );
};

export default FeedbackButton;
