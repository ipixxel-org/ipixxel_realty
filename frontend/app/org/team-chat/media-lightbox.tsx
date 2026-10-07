"use client";

import { useEffect, useState } from "react";
import Lightbox, { type Slide } from "yet-another-react-lightbox";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Video from "yet-another-react-lightbox/plugins/video";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/counter.css";
import type { ChatAttachment } from "@/lib/team-chat/types";
import { attachmentUrl, mediaKind } from "@/lib/team-chat/uploads";

/** Full-screen viewer for a message's photos and videos (lazy-loaded). */
export default function MediaLightbox({
  items,
  index,
  onClose,
}: {
  items: ChatAttachment[];
  index: number;
  onClose: () => void;
}) {
  const [slides, setSlides] = useState<Slide[] | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all(
      items.map(async (a): Promise<Slide> => {
        const src = await attachmentUrl(a.id).catch(() => "");
        if (mediaKind(a.mimeType) === "video") {
          return {
            type: "video",
            width: a.width ?? undefined,
            height: a.height ?? undefined,
            autoPlay: true,
            controls: true,
            sources: [{ src, type: a.mimeType }],
          };
        }
        return { src, alt: a.fileName, width: a.width ?? undefined, height: a.height ?? undefined };
      }),
    ).then((s) => alive && setSlides(s));
    return () => {
      alive = false;
    };
  }, [items]);

  if (!slides) return null;
  return (
    <Lightbox
      open
      close={onClose}
      index={index}
      slides={slides}
      plugins={[Video, Zoom, ...(slides.length > 1 ? [Counter] : [])]}
      carousel={{ finite: true }}
      controller={{ closeOnBackdropClick: true }}
    />
  );
}
