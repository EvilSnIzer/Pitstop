"use client";

import { RefObject, useEffect, useRef } from "react";

export function useDialogFocus(
  open: boolean,
  panel: RefObject<HTMLElement | null>,
  close: () => void,
) {
  const onClose = useRef(close);
  useEffect(() => {
    onClose.current = close;
  }, [close]);
  useEffect(() => {
    if (!open || !panel.current) return;
    const previous = document.activeElement as HTMLElement | null;
    const element = panel.current;
    const focusable = () =>
      Array.from(
        element.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input,textarea,[tabindex="0"]',
        ),
      ).filter((e) => e.getClientRects().length > 0);
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose.current();
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [open, panel]);
}
