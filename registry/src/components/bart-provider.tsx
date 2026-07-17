"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  useBartChat,
  type UseBartChatOptions,
  type UseBartChatReturn,
} from "../core/use-bart-chat";
import type { BartAppearance } from "../core/types";
import { BartIcon } from "./icons";

/**
 * Shared state every Bart component reads. `BartProvider` runs the headless
 * core and owns the panel's open state; the shells and the composable parts
 * (title, header, messages, input, action buttons) consume it from here rather
 * than through prop drilling, so a consumer can rearrange the pieces freely.
 * Security still lives entirely in `useBartChat` — the parts are presentation.
 */
export interface BartContextValue {
  bart: UseBartChatReturn;
  /** Whether the shell panel is open. */
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Display name shown in launchers, headers, and the selection popover. */
  title: string;
  /** Brand mark rendered next to the title everywhere one appears. */
  icon: ReactNode;
  /** Surface finish shared by the shell's panel(s). */
  appearance: BartAppearance;
  /** Attach selected page text and open the shell — used by the popover. */
  askAboutSelection: (text: string) => void;
}

const BartContext = createContext<BartContextValue | null>(null);

/** Read the shared Bart state. Throws outside a `<BartProvider>`/`<BartChat>`. */
export function useBartContext(): BartContextValue {
  const value = useContext(BartContext);
  if (!value) {
    throw new Error(
      "Bart components must be rendered inside <BartProvider> (or <BartChat>).",
    );
  }
  return value;
}

/**
 * Per-shell context carrying the mounted panel's motion-aware `close`. It is
 * separate from `BartContext` because only a component rendered inside a shell
 * can play that shell's exit animation; everything else closes by flipping the
 * shared open state.
 */
interface BartShellContextValue {
  close: () => void;
}
const BartShellContext = createContext<BartShellContextValue | null>(null);

/** Each shell wraps its panel contents in this so `<CloseButton>` can animate. */
export function BartShellProvider({
  close,
  children,
}: {
  close: () => void;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ close }), [close]);
  return (
    <BartShellContext.Provider value={value}>
      {children}
    </BartShellContext.Provider>
  );
}

/**
 * Close Bart from a composable button. Inside a shell this plays the panel's
 * exit animation; outside one (no shell context) it falls back to flipping the
 * shared open state.
 */
export function useCloseBart(): () => void {
  const shell = useContext(BartShellContext);
  const { setOpen } = useBartContext();
  return shell ? shell.close : () => setOpen(false);
}

export interface BartProviderProps extends UseBartChatOptions {
  /** Display name shown everywhere the shell names itself. Default `"Bart"`. */
  title?: string;
  /** Brand mark; any node. Defaults to the Bart ring mark. */
  icon?: ReactNode;
  /** Surface finish: opaque `"default"` or backdrop-blur `"glass"`. */
  appearance?: BartAppearance;
  /** Controlled open state. Omit for uncontrolled (starts from `defaultOpen`). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Initial open state when uncontrolled. Default `false`. */
  defaultOpen?: boolean;
  children: ReactNode;
}

export function BartProvider({
  title = "Bart",
  icon = <BartIcon />,
  appearance = "default",
  open: controlledOpen,
  onOpenChange,
  defaultOpen = false,
  children,
  ...chatOptions
}: BartProviderProps) {
  const bart = useBartChat(chatOptions);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const askAboutSelection = useCallback(
    (text: string) => {
      bart.attachQuote(text);
      setOpen(true);
    },
    [bart.attachQuote, setOpen],
  );

  const value = useMemo<BartContextValue>(
    () => ({ bart, open, setOpen, title, icon, appearance, askAboutSelection }),
    [bart, open, setOpen, title, icon, appearance, askAboutSelection],
  );

  return <BartContext.Provider value={value}>{children}</BartContext.Provider>;
}
