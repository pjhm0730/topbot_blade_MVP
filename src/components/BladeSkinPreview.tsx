import type { CSSProperties } from "react";
import { getBladeSkin } from "../game/bladeSkins";

interface BladeSkinPreviewProps {
  skinId: string;
  size?: "small" | "medium" | "large";
  showName?: boolean;
  highlighted?: boolean;
  label?: string;
  className?: string;
}

export function BladeSkinPreview({
  skinId,
  size = "medium",
  showName = true,
  highlighted = false,
  label,
  className = "",
}: BladeSkinPreviewProps) {
  const skin = getBladeSkin(skinId);
  const style = {
    "--skin-primary": skin.primaryColor,
    "--skin-secondary": skin.secondaryColor,
    "--skin-accent": skin.accentColor,
  } as CSSProperties;

  return (
    <div
      className={`blade-preview blade-preview-${size} ${highlighted ? "blade-preview-highlighted" : ""} ${className}`}
      style={style}
    >
      <div className={`blade-disc pattern-${skin.patternType}`} aria-hidden="true">
        <span className="blade-icon">{skin.iconSymbol}</span>
        {label && <span className="blade-preview-badge">{label}</span>}
      </div>
      {showName && (
        <div className="blade-preview-meta">
          <strong>{skin.name}</strong>
          <span>{skin.description}</span>
        </div>
      )}
    </div>
  );
}
