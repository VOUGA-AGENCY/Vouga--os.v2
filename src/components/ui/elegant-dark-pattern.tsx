import type { ReactNode } from "react";

interface DarkGradientBgProps {
  children?: ReactNode;
  className?: string;
}

export function DarkGradientBg({
  children,
  className = "",
}: DarkGradientBgProps) {
  return (
    <div className={`elegant-dark-pattern ${className}`.trim()}>
      <div className="elegant-dark-pattern-gradient" aria-hidden="true">
        <span className="elegant-dark-pattern-streak elegant-dark-pattern-streak-one" />
        <span className="elegant-dark-pattern-streak elegant-dark-pattern-streak-two" />
        <span className="elegant-dark-pattern-streak elegant-dark-pattern-streak-three" />
        <span className="elegant-dark-pattern-streak elegant-dark-pattern-streak-four" />
        <span className="elegant-dark-pattern-streak elegant-dark-pattern-streak-five" />
      </div>
      <div className="elegant-dark-pattern-texture" aria-hidden="true" />
      <div className="elegant-dark-pattern-dots" aria-hidden="true" />
      <div className="elegant-dark-pattern-highlight" aria-hidden="true" />
      <div className="elegant-dark-pattern-content">{children}</div>
    </div>
  );
}
