"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useChat, type UseChatHelpers } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { runHighlight } from "./highlight";
import { runInteract } from "./interact";
import {
  appendSelection,
  buildQuotedMessage,
  MAX_SELECTION_ITEMS,
} from "./selection";
import {
  resolveToolPolicies,
  validateInteraction,
  validateRoute,
  validateTarget,
} from "./tool-policy";
import type {
  BartPublicManifest,
  BartHighlightOptions,
  BartToolOutput,
  BartToolPolicies,
  BartUIMessage,
} from "./types";

export type BartToolName = "navigate" | "highlight" | "interact";

/** Runtime guard for model-supplied tool names — never trust the wire. */
export function isBartToolName(name: unknown): name is BartToolName {
  return name === "navigate" || name === "highlight" || name === "interact";
}

function stringField(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function clampLimit(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(Math.floor(value), minimum), maximum);
}

export interface UseBartChatOptions {
  api: string;
  currentRoute: string;
  navigate: (route: string) => void;
  manifest: BartPublicManifest;
  toolPolicy?: Partial<BartToolPolicies>;
  /** Consumer-owned styling and timing for highlights and click flashes. */
  highlightOptions?: BartHighlightOptions;
  /** Hard cap on navigations per assistant turn to prevent loops. */
  maxNavigationsPerTurn?: number;
  /** Hard cap on element clicks per assistant turn to prevent loops. */
  maxInteractionsPerTurn?: number;
  /** Maximum selected-text pills attached to the next message. Default 8. */
  maxPendingSelections?: number;
}

export interface UseBartChatReturn {
  messages: BartUIMessage[];
  status: UseChatHelpers<BartUIMessage>["status"];
  error: Error | undefined;
  policies: BartToolPolicies;
  sendText: (text: string) => void;
  stop: () => void;
  clearError: () => void;
  /** Selected page-text items attached to the next message. */
  pendingQuotes: string[];
  attachQuote: (rawSelection: string) => void;
  removeQuote: (index: number) => void;
  clearQuotes: () => void;
  /** Start a fresh conversation: aborts streaming, clears messages/quote/error. */
  reset: () => void;
  /** When true, `confirm`-policy tools run without the approval card. */
  autoApprove: boolean;
  setAutoApprove: (autoApprove: boolean) => void;
  /** Resolve a pending `confirm`-policy tool call from the approval UI. */
  respondToToolCall: (options: {
    toolName: BartToolName;
    toolCallId: string;
    input: unknown;
    approved: boolean;
  }) => void;
}

/**
 * Headless core shared by every Bart variant. Owns transport, streaming
 * state, and — deliberately — all tool-policy enforcement, so replacing or
 * restyling a variant shell cannot weaken navigation/highlight rules.
 */
export function useBartChat(options: UseBartChatOptions): UseBartChatReturn {
  const { api, manifest } = options;
  const configuredPolicies = resolveToolPolicies(options.toolPolicy);
  // The user-facing "auto-approve" toggle. It only skips the approval card:
  // `confirm` becomes `auto`, while `disabled` stays disabled — the toggle can
  // never grant a capability the consumer turned off.
  const [autoApprove, setAutoApprove] = useState(false);
  const policies = useMemo<BartToolPolicies>(() => {
    if (!autoApprove) return configuredPolicies;
    return {
      navigate:
        configuredPolicies.navigate === "confirm"
          ? "auto"
          : configuredPolicies.navigate,
      highlight:
        configuredPolicies.highlight === "confirm"
          ? "auto"
          : configuredPolicies.highlight,
      interact:
        configuredPolicies.interact === "confirm"
          ? "auto"
          : configuredPolicies.interact,
    };
  }, [
    autoApprove,
    configuredPolicies.navigate,
    configuredPolicies.highlight,
    configuredPolicies.interact,
  ]);
  // Security caps, not preferences: consumer configuration can lower these
  // but never raise them past the documented ceilings.
  const maxNavigations = clampLimit(options.maxNavigationsPerTurn ?? 2, 0, 10);
  const maxInteractions = clampLimit(options.maxInteractionsPerTurn ?? 3, 0, 10);
  const maxPendingSelections = clampLimit(
    options.maxPendingSelections ?? MAX_SELECTION_ITEMS,
    1,
    MAX_SELECTION_ITEMS,
  );

  const routeRef = useRef(options.currentRoute);
  routeRef.current = options.currentRoute;
  const navigateRef = useRef(options.navigate);
  navigateRef.current = options.navigate;
  const policiesRef = useRef(policies);
  policiesRef.current = policies;
  const navigationsThisTurn = useRef(0);
  const interactionsThisTurn = useRef(0);
  const helpersRef = useRef<UseChatHelpers<BartUIMessage> | null>(null);

  const executeTool = useCallback(
    (toolName: BartToolName, input: unknown): BartToolOutput => {
      if (toolName === "navigate") {
        const route = stringField(input, "route");
        if (route === undefined) return { ok: false, reason: "invalid-route" };
        const check = validateRoute(manifest, route);
        if (!check.ok) return check;
        if (navigationsThisTurn.current >= maxNavigations) {
          return { ok: false, reason: "navigation-limit-reached" };
        }
        navigationsThisTurn.current += 1;
        navigateRef.current(route);
        return { ok: true };
      }
      const target = stringField(input, "target");
      if (target === undefined) return { ok: false, reason: "invalid-target" };
      if (toolName === "interact") {
        const check = validateInteraction(manifest, routeRef.current, target);
        if (!check.ok) return check;
        if (interactionsThisTurn.current >= maxInteractions) {
          return { ok: false, reason: "interaction-limit-reached" };
        }
        interactionsThisTurn.current += 1;
        return runInteract(target, options.highlightOptions);
      }
      const check = validateTarget(manifest, routeRef.current, target);
      if (!check.ok) return check;
      return runHighlight(target, options.highlightOptions);
    },
    [manifest, maxNavigations, maxInteractions, options.highlightOptions],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport<BartUIMessage>({
        api,
        prepareSendMessagesRequest: ({ id, messages }) => ({
          body: { id, messages, currentRoute: routeRef.current },
        }),
      }),
    [api],
  );

  const chat = useChat<BartUIMessage>({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: ({ toolCall }) => {
      const { toolName } = toolCall;
      const helpers = helpersRef.current;
      if (!helpers) return;
      if (!isBartToolName(toolName)) {
        void helpers.addToolOutput({
          state: "output-error",
          tool: toolName,
          toolCallId: toolCall.toolCallId,
          errorText: "unknown-tool",
        });
        return;
      }
      const policy = policiesRef.current[toolName];
      // `confirm` waits for the approval UI; everything else resolves now.
      if (policy === "confirm") return;
      const output: BartToolOutput =
        policy === "disabled"
          ? { ok: false, reason: "disabled-by-policy" }
          : executeTool(toolName, toolCall.input);
      void helpers.addToolOutput({
        tool: toolName,
        toolCallId: toolCall.toolCallId,
        output,
      });
    },
  });
  helpersRef.current = chat;

  const [pendingQuotes, setPendingQuotes] = useState<string[]>([]);
  // Read through a ref so sendText keeps one identity across quote changes.
  const quotesRef = useRef(pendingQuotes);
  quotesRef.current = pendingQuotes;

  const sendText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      navigationsThisTurn.current = 0;
      interactionsThisTurn.current = 0;
      const quotes = quotesRef.current;
      const message =
        quotes.length > 0 ? buildQuotedMessage(quotes, trimmed) : trimmed;
      setPendingQuotes([]);
      void chat.sendMessage({ text: message });
    },
    [chat.sendMessage],
  );

  const attachQuote = useCallback((rawSelection: string) => {
    setPendingQuotes((current) =>
      appendSelection(current, rawSelection, maxPendingSelections),
    );
  }, [maxPendingSelections]);

  const reset = useCallback(() => {
    void chat.stop();
    chat.setMessages([]);
    chat.clearError();
    setPendingQuotes([]);
    navigationsThisTurn.current = 0;
    interactionsThisTurn.current = 0;
  }, [chat.stop, chat.setMessages, chat.clearError]);

  const respondToToolCall = useCallback<UseBartChatReturn["respondToToolCall"]>(
    ({ toolName, toolCallId, input, approved }) => {
      const output: BartToolOutput = approved
        ? { ...executeTool(toolName, input), approvedByUser: true }
        : { ok: false, reason: "denied-by-user" };
      void chat.addToolOutput({ tool: toolName, toolCallId, output });
    },
    [chat.addToolOutput, executeTool],
  );

  const stop = useCallback(() => void chat.stop(), [chat.stop]);

  const removeQuote = useCallback(
    (index: number) =>
      setPendingQuotes((current) =>
        current.filter((_, currentIndex) => currentIndex !== index),
      ),
    [],
  );

  const clearQuotes = useCallback(() => setPendingQuotes([]), []);

  return {
    messages: chat.messages,
    status: chat.status,
    error: chat.error,
    policies,
    sendText,
    stop,
    clearError: chat.clearError,
    pendingQuotes,
    attachQuote,
    removeQuote,
    clearQuotes,
    reset,
    autoApprove,
    setAutoApprove,
    respondToToolCall,
  };
}
