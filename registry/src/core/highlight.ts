import type { BartHighlightOptions, BartToolOutput } from "./types";

interface ActiveHighlight {
  overlay: HTMLElement;
  timer: number;
  cleanup: () => void;
}

let active: ActiveHighlight | null = null;

function liveRegion(): HTMLElement {
  let region = document.getElementById("bart-live-region");
  if (!region) {
    region = document.createElement("div");
    region.id = "bart-live-region";
    region.className = "bart-sr-only";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
  }
  return region;
}

export function dismissHighlight(): void {
  if (!active) return;
  window.clearTimeout(active.timer);
  active.cleanup();
  active.overlay.remove();
  active = null;
}

/**
 * Highlight an opted-in page element. The target id must already be validated
 * against the manifest; this only locates `data-bart-target` elements and
 * never accepts arbitrary selectors. The overlay is absolutely positioned so
 * it causes no layout shift, and it cleans itself up after `durationMs`.
 */
export function runHighlight(
  targetId: string,
  options?: BartHighlightOptions & { label?: string },
): BartToolOutput {
  const element = document.querySelector(
    `[data-bart-target="${CSS.escape(targetId)}"]`,
  );
  if (!(element instanceof Element)) {
    return { ok: false, reason: "target-not-found" };
  }

  dismissHighlight();

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  element.scrollIntoView({
    behavior: reducedMotion ? "auto" : "smooth",
    block: "center",
  });

  const pad = Math.min(Math.max(options?.padding ?? 6, 0), 64);
  const overlay = document.createElement("div");
  overlay.className = "bart-highlight-overlay";
  overlay.setAttribute("aria-hidden", "true");
  if (options?.borderColor) {
    overlay.style.setProperty("--bart-highlight-border-color", options.borderColor);
  }
  if (options?.backgroundColor) {
    overlay.style.setProperty("--bart-highlight-fill", options.backgroundColor);
  }
  if (options?.ringColor) {
    overlay.style.setProperty("--bart-highlight-ring-color", options.ringColor);
  }
  if (options?.borderRadius) {
    overlay.style.setProperty("--bart-highlight-radius", options.borderRadius);
  }
  if (options?.borderStyle) {
    overlay.style.setProperty("--bart-highlight-border-style", options.borderStyle);
  }
  if (options?.borderWidth !== undefined) {
    const width = Math.min(Math.max(options.borderWidth, 0), 16);
    overlay.style.setProperty("--bart-highlight-border-width", `${width}px`);
  }

  let frame = 0;
  const position = () => {
    frame = 0;
    const rect = element.getBoundingClientRect();
    overlay.style.top = `${rect.top + window.scrollY - pad}px`;
    overlay.style.left = `${rect.left + window.scrollX - pad}px`;
    overlay.style.width = `${rect.width + pad * 2}px`;
    overlay.style.height = `${rect.height + pad * 2}px`;
  };
  const schedulePosition = () => {
    if (frame === 0) frame = window.requestAnimationFrame(position);
  };
  position();
  document.body.appendChild(overlay);

  window.addEventListener("resize", schedulePosition);
  window.addEventListener("scroll", schedulePosition, true);
  const resizeObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(schedulePosition);
  resizeObserver?.observe(element);

  liveRegion().textContent =
    options?.label ?? `Highlighted page section: ${targetId}`;

  const duration = Math.min(Math.max(options?.durationMs ?? 4000, 250), 30_000);
  const timer = window.setTimeout(dismissHighlight, duration);
  active = {
    overlay,
    timer,
    cleanup: () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", schedulePosition);
      window.removeEventListener("scroll", schedulePosition, true);
    },
  };
  return { ok: true };
}
