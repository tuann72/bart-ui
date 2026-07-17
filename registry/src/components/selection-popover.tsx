"use client";

import { useEffect, useState, type AnimationEvent } from "react";
import { motionDisabled } from "../core/motion";
import { normalizeSelection } from "../core/selection";
import { useBartContext } from "./bart-provider";

interface PopoverState {
  x: number;
  y: number;
  text: string;
}

function eligibleSelection(): { text: string; rect: DOMRect } | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  // Never offer the popup for text selected inside Bart's own UI.
  const container =
    range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
  if (container?.closest("[data-bart-ui]")) return null;
  const text = normalizeSelection(selection.toString());
  if (!text) return null;
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { text, rect };
}

/**
 * Floating "Ask Bart" button shown above a text selection. Reads the title,
 * icon, and the attach-and-open action from context, so it must render inside a
 * `<BartProvider>` (or `<BartChat>`). The selected text is normalized/capped by
 * `askAboutSelection`.
 */
export function BartSelectionPopover() {
  const { title, icon, askAboutSelection } = useBartContext();
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [closing, setClosing] = useState(false);

  // Losing the selection plays the popup out rather than unmounting it, so the
  // node survives long enough for the exit animation to run.
  const dismiss = () => {
    if (motionDisabled()) {
      setPopover(null);
      return;
    }
    setClosing(true);
  };

  const show = (next: PopoverState) => {
    setClosing(false);
    setPopover(next);
  };

  // Fires for the entrance animation too, hence the `closing` guard.
  const onAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (closing && event.target === event.currentTarget) setPopover(null);
  };

  useEffect(() => {
    // Selections are inspected after pointer/keyboard interaction settles,
    // not on every selectionchange, so the popup doesn't flicker mid-drag.
    const update = () => {
      const found = eligibleSelection();
      if (!found) {
        dismiss();
        return;
      }
      show({
        x: found.rect.left + found.rect.width / 2,
        y: found.rect.top,
        text: found.text,
      });
    };
    const onPointerUp = () => requestAnimationFrame(update);
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismiss();
        return;
      }
      if (event.shiftKey || event.key === "Shift") requestAnimationFrame(update);
    };
    const onSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) dismiss();
    };
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, []);

  if (!popover) return null;

  return (
    <div
      data-bart-ui="selection-popover"
      data-state={closing ? "closed" : "open"}
      className="bart-selection-popover"
      style={{ left: popover.x, top: popover.y }}
      onAnimationEnd={onAnimationEnd}
    >
      <button
        type="button"
        className="bart-btn-primary"
        // Keep the selection alive: mousedown would collapse it before click.
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => {
          dismiss();
          window.getSelection()?.removeAllRanges();
          askAboutSelection(popover.text);
        }}
      >
        {icon} Ask {title}
      </button>
    </div>
  );
}
