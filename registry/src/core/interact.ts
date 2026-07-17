import { runHighlight } from "./highlight";
import type { BartHighlightOptions, BartToolOutput } from "./types";

/**
 * Elements the interact tool may click. Links are deliberately excluded:
 * following an href would bypass route allowlisting and the injected router,
 * so page changes stay with the navigate tool.
 */
function isClickable(element: HTMLElement): boolean {
  if (element instanceof HTMLButtonElement) return true;
  if (element instanceof HTMLInputElement) {
    return ["button", "submit", "reset"].includes(element.type);
  }
  return element.tagName === "SUMMARY";
}

/**
 * Click an opted-in page element. The target id must already be validated
 * against the manifest (registered on the current route AND flagged
 * interactive); this adds the runtime checks only the DOM can answer, flashes
 * the highlight overlay so the user sees what was clicked, then dispatches a
 * native click so the page's own handlers run unchanged.
 */
export function runInteract(
  targetId: string,
  highlightOptions?: BartHighlightOptions,
): BartToolOutput {
  const element = document.querySelector(
    `[data-bart-target="${CSS.escape(targetId)}"]`,
  );
  if (!(element instanceof HTMLElement)) {
    return { ok: false, reason: "target-not-found" };
  }
  if (!isClickable(element)) {
    return { ok: false, reason: "target-not-interactive" };
  }
  if (
    (element instanceof HTMLButtonElement ||
      element instanceof HTMLInputElement) &&
    element.disabled
  ) {
    return { ok: false, reason: "target-disabled" };
  }

  // Scrolls into view, draws the overlay, and announces via the shared
  // aria-live region — the user always sees and hears what got clicked.
  const shown = runHighlight(targetId, {
    ...highlightOptions,
    durationMs: 1600,
    label: `Clicked: ${targetId}`,
  });
  if (!shown.ok) return shown;

  element.click();
  return { ok: true };
}
