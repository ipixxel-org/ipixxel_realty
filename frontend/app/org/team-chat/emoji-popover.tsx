"use client";

import { useEffect, useRef } from "react";
import EmojiPickerReact, { EmojiStyle, SuggestionMode } from "emoji-picker-react";

/**
 * Lazy-loaded emoji picker. Native emoji only — the library's default image
 * style would fetch sprites from a public CDN.
 */
export default function EmojiPopover({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // Clicks on the toggle button are handled by the button itself.
      if (ref.current && !ref.current.contains(target) && !ref.current.parentElement?.contains(target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="tch-emoji-pop" ref={ref}>
      <EmojiPickerReact
        emojiStyle={EmojiStyle.NATIVE}
        suggestedEmojisMode={SuggestionMode.RECENT}
        lazyLoadEmojis
        width={320}
        height={380}
        previewConfig={{ showPreview: false }}
        onEmojiClick={(e) => onPick(e.emoji)}
      />
    </div>
  );
}
