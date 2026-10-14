"use client";

import type { BlockConfig } from "../types";
import { isMediaSrc } from "@/lib/media";

interface IconProps {
  icon?: string;
  size?: string;
  width?: number | string;
  height?: number | string;
  color?: string;
  backgroundColor?: string;
  align?: "left" | "center" | "right";
  link?: string;
  target?: "_self" | "_blank";
  label?: string;
}

export function IconBlock({ block }: { block: BlockConfig }) {
  const p = block.props as IconProps;
  const size = p.size || "48px";
  const width = p.width || size;
  const height = p.height || size;
  const color = p.color || "var(--color-accent)";
  const icon = p.icon || "";
  const alignment = p.align || "center";
  const justify = alignment === "left" ? "justify-start" : alignment === "right" ? "justify-end" : "justify-center";

  const content = (
    <div className={`px-6 py-6 flex ${justify}`}>
      <div className="flex flex-col items-center gap-2" style={{ color }}>
      <div style={{ width, height, color, backgroundColor: p.backgroundColor || undefined }} className="flex items-center justify-center rounded-lg">
        {isMediaSrc(icon) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={icon} alt={p.label || ""} className="w-full h-full object-contain" />
        ) : icon ? (
          <span className="text-4xl leading-none">{icon}</span>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        )}
      </div>
      {p.label ? <span className="text-sm text-text-1">{p.label}</span> : null}
      </div>
    </div>
  );

  if (p.link) {
    return (
      <a href={p.link} target={p.target || "_self"} rel={p.target === "_blank" ? "noopener noreferrer" : undefined} className="block hover:opacity-80 transition-opacity">
        {content}
      </a>
    );
  }
  return content;
}
