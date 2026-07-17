export { BartChat, type BartChatProps } from "./components/bart-chat";
export {
  BartProvider,
  useBartContext,
  useCloseBart,
  type BartContextValue,
  type BartProviderProps,
} from "./components/bart-provider";
export { BartDock } from "./components/dock";
export { BartSidebar, type SidebarLauncher } from "./components/sidebar";
export { BartSpotlight } from "./components/spotlight";
export {
  AutoApproveButton,
  BartActions,
  BartBody,
  BartHeader,
  BartInput,
  BartMessages,
  BartTitle,
  CloseButton,
  NewChatButton,
} from "./components/chat-parts";
export { BartSelectionPopover } from "./components/selection-popover";
export {
  appendSelection,
  buildQuotedMessage,
  normalizeSelection,
  MAX_SELECTION_CHARS,
  MAX_SELECTION_ITEMS,
} from "./core/selection";
export {
  isBartToolName,
  useBartChat,
  type BartToolName,
  type UseBartChatOptions,
  type UseBartChatReturn,
} from "./core/use-bart-chat";
export { dismissHighlight, runHighlight } from "./core/highlight";
export { runInteract } from "./core/interact";
export { shouldTriggerShortcut, type ShortcutEventLike } from "./core/shortcut";
export {
  DEFAULT_TOOL_POLICIES,
  resolveToolPolicies,
  validateInteraction,
  validateRoute,
  validateTarget,
} from "./core/tool-policy";
export type {
  BartAppearance,
  BartPublicManifest,
  BartRoute,
  BartTarget,
  BartToolOutput,
  BartToolPolicies,
  BartTools,
  BartUIMessage,
  BartVariant,
  HighlightInput,
  InteractInput,
  NavigateInput,
  ToolPolicy,
} from "./core/types";
