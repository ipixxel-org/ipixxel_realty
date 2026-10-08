"use client";

import { useEffect, useState } from "react";
import Lightbox, { type Slide } from "yet-another-react-lightbox";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Download from "yet-another-react-lightbox/plugins/download";
import Video from "yet-another-react-lightbox/plugins/video";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/counter.css";
import { useToast } from "@/components/ui/toast";
import type { ChatAttachment } from "@/lib/team-chat/types";
import { attachmentUrl, downloadAttachment, mediaKind } from "@/lib/team-chat/uploads";

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
  const { toast } = useToast();
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
      plugins={[Video, Zoom, Download, ...(slides.length > 1 ? [Counter] : [])]}
      download={{
        // Viewing links are "inline"; ask for a save-as link instead.
        download: ({ slide }) => {
          const a = items[slides.indexOf(slide)];
          if (!a) return;
          downloadAttachment(a).catch(() =>
            toast({ title: "Couldn't download the file", description: "It may have been removed.", variant: "error" }),
          );
        },
      }}
      carousel={{ finite: true }}
      controller={{ closeOnBackdropClick: true }}
    />
  );
}
