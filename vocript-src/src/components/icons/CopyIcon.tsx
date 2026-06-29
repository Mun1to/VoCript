import React from "react";

interface CopyIconProps {
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

const CopyIcon: React.FC<CopyIconProps> = ({
  width = 18,
  height = 18,
  color = "#93c5fd",
  className = "",
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
};

export default CopyIcon;
