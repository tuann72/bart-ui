"use client";

import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useFocusTrap } from "../core/focus-trap";
import {
  clampSize,
  growthFromPointer,
  keyboardResizeDelta,
  type BartSide,
} from "../core/resize";
import { useResizeDrag } from "../core/use-resize-drag";
import { useShellLifecycle } from "../core/use-shell-lifecycle";
import type { ReactNode } from "react";
import { useBartContext } from "./bart-provider";
import { BartPanelContents, surfaceClass } from "./chat-parts";

const DEFAULT_DOCK_SIZE = { width: 384, height: 448 };
const MIN_DOCK_SIZE = { width: 320, height: 320 };
const MAX_DOCK_SIZE = { width: 512, height: 832 };

function dockSizeLimits() {
  return {
    width: Math.min(MAX_DOCK_SIZE.width, window.innerWidth - 32),
    height: Math.min(MAX_DOCK_SIZE.height, window.innerHeight * 0.92),
  };
}

export interface BartDockProps {
  side?: BartSide;
  /** `true`/omitted: standard header. `false`/`null`: none. Node: your own. */
  header?: ReactNode;
  /** Draw the line between the conversation and the input row. Default on. */
  inputSeparator?: boolean;
  /** Panel contents. Defaults to the standard header + body. */
  children?: ReactNode;
}

export function BartDock({
  side = "right",
  header,
  inputSeparator = true,
  children,
}: BartDockProps) {
  const { open, setOpen, title, icon, appearance } = useBartContext();
  const [size, setSize] = useState(DEFAULT_DOCK_SIZE);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef(DEFAULT_DOCK_SIZE);
  const { showPanel, closing, close, panelAnimationEnd } = useShellLifecycle({
    open,
    onOpenChange: setOpen,
    restoreFocusTo: launcherRef,
  });
  useFocusTrap(panelRef, showPanel);

  const sideClass = side === "left" ? "bart-dock-left" : "bart-dock-right";

  const resizeTo = (width: number, height: number) => {
    const limits = dockSizeLimits();
    setSize({
      width: clampSize(width, MIN_DOCK_SIZE.width, limits.width),
      height: clampSize(height, MIN_DOCK_SIZE.height, limits.height),
    });
  };

  const handleProps = useResizeDrag(() => {
    const bounds = panelRef.current?.getBoundingClientRect();
    if (bounds) dragStart.current = { width: bounds.width, height: bounds.height };
  });

  const widthFrom = (dx: number) =>
    dragStart.current.width + growthFromPointer(side, dx);
  const heightFrom = (dy: number) => dragStart.current.height - dy;

  const cornerCursor = side === "right" ? "nwse" : "nesw";
  const corner = handleProps(cornerCursor, (dx, dy) =>
    resizeTo(widthFrom(dx), heightFrom(dy)),
  );
  const topEdge = handleProps("ns", (_dx, dy) =>
    resizeTo(dragStart.current.width, heightFrom(dy)),
  );
  const sideEdge = handleProps("ew", (dx) =>
    resizeTo(widthFrom(dx), dragStart.current.height),
  );

  const resizeWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const delta = keyboardResizeDelta(event.key, event.shiftKey, side);
    if (!delta) return;
    event.preventDefault();
    resizeTo(size.width + delta.width, size.height + delta.height);
  };

  if (!showPanel) {
    return (
      <button
        ref={launcherRef}
        type="button"
        data-bart-ui="dock-tab"
        className={`bart-dock-tab ${sideClass}`}
        aria-expanded="false"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {icon} {title}
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`${title} assistant`}
      data-bart-ui="dock-panel"
      className={`${surfaceClass(appearance)} bart-dock-panel ${sideClass}${inputSeparator ? "" : " bart-no-separator"}${closing ? " bart-closing" : ""}`}
      style={{ width: size.width, height: size.height }}
      onAnimationEnd={panelAnimationEnd}
    >
      <button
        type="button"
        className="bart-resize-handle bart-dock-resize"
        aria-label="Resize chat panel"
        onKeyDown={resizeWithKeyboard}
        {...corner}
      />
      {/* Pointer-only, so they stay out of the tab order: the corner button
          above already resizes both axes from the keyboard, and two extra tab
          stops that each do less would only pad the traversal. */}
      <div
        aria-hidden="true"
        className="bart-resize-handle bart-dock-edge bart-dock-edge-top"
        {...topEdge}
      />
      <div
        aria-hidden="true"
        className="bart-resize-handle bart-dock-edge bart-dock-edge-side"
        {...sideEdge}
      />
      <BartPanelContents close={close} header={header}>
        {children}
      </BartPanelContents>
    </div>
  );
}
