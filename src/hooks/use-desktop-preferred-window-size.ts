import { useEffect, useRef } from "react";

import { postDesktopHostMessage } from "@/lib/api";

interface PreferredWindowSize {
  contentWidth: number;
  contentHeight: number;
}

export function useDesktopPreferredWindowSize(enabled: boolean) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const lastSizeRef = useRef<PreferredWindowSize | null>(null);

  useEffect(() => {
    if (!enabled) {
      lastSizeRef.current = null;
      postDesktopHostMessage({ type: "desktop.window.resetSize" });
      return;
    }

    const element = contentRef.current;
    if (!element) {
      return;
    }

    let frameId = 0;

    const postPreferredSize = () => {
      frameId = 0;

      const contentWidth = Math.ceil(element.getBoundingClientRect().width);
      const contentHeight = Math.ceil(element.getBoundingClientRect().height);

      if (contentWidth <= 0 || contentHeight <= 0) {
        return;
      }

      const previousSize = lastSizeRef.current;
      if (
        previousSize &&
        previousSize.contentWidth === contentWidth &&
        previousSize.contentHeight === contentHeight
      ) {
        return;
      }

      lastSizeRef.current = { contentWidth, contentHeight };
      postDesktopHostMessage({
        type: "desktop.window.setPreferredSize",
        payload: { contentWidth, contentHeight },
      });
    };

    if (typeof ResizeObserver === "undefined") {
      postPreferredSize();
      return;
    }

    const observer = new ResizeObserver(() => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }

      frameId = requestAnimationFrame(postPreferredSize);
    });

    observer.observe(element);
    postPreferredSize();

    return () => {
      observer.disconnect();

      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [enabled]);

  return contentRef;
}
