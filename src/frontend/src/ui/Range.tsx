import React, { useEffect } from "react";

import "./Range.scss";

export type RangeProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  minLabel?: string;
  maxLabel?: string;
  showValueBubble?: boolean;
};

export const Range = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  minLabel,
  maxLabel,
  showValueBubble = true,
}: RangeProps) => {
  const rangeRef = React.useRef<HTMLInputElement>(null);
  const valueRef = React.useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (rangeRef.current) {
      const rangeElement = rangeRef.current;
      
      // Update value bubble position if it exists
      if (showValueBubble && valueRef.current) {
        const valueElement = valueRef.current;
        const inputWidth = rangeElement.offsetWidth;
        const thumbWidth = 16; // Match the --slider-thumb-size CSS variable
        const position =
          ((value - min) / (max - min)) * (inputWidth - thumbWidth) + thumbWidth / 2;
        valueElement.style.left = `${position}px`;
      }
      
      // Calculate percentage for gradient
      const percentage = ((value - min) / (max - min)) * 100;
      rangeElement.style.background = `linear-gradient(to right, var(--color-slider-track) 0%, var(--color-slider-track) ${percentage}%, var(--button-bg) ${percentage}%, var(--button-bg) 100%)`;
    }
  }, [value, min, max, showValueBubble]);

  return (
    <label className="control-label">
      <div className="range-wrapper">
        <input
          ref={rangeRef}
          type="range"
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            onChange(+event.target.value);
          }}
          value={value}
          className="range-input"
        />
        {showValueBubble && (
          <div className="value-bubble" ref={valueRef}>
            {value !== min ? value : null}
          </div>
        )}
        {min === 0 ? (
          <div className="zero-label">{minLabel || min}</div>
        ) : (
          <div className="min-label">{minLabel || min}</div>
        )}
        <div className="max-label">{maxLabel || max}</div>
      </div>
    </label>
  );
};
