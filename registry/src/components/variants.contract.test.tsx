import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import type {
  BartAppearance,
  BartPublicManifest,
  BartVariant,
} from "../core/types";
import { BartProvider } from "./bart-provider";
import { BartDock } from "./dock";
import { BartSidebar } from "./sidebar";
import { BartSpotlight } from "./spotlight";

/**
 * Contract suite: the behavior every variant must expose, run against all
 * three shells. Written against the pre-refactor components and kept passing
 * through the refactor — tests assert user-visible outcomes (what is mounted,
 * what has focus, what got sent), never implementation details.
 */

const manifest: BartPublicManifest = {
  routes: [
    {
      route: "/",
      title: "Home",
      description: "Home page",
      targets: [
        { id: "order-button", description: "Order button", interactive: true },
      ],
    },
    { route: "/faq", title: "FAQ", description: "Questions", targets: [] },
  ],
};

// ---------- environment shims ----------

function setReducedMotion(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: matches && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

/** FIFO fetch mock: each entry answers one request, in order. */
let fetchQueue: Array<() => Response | Promise<Response>>;
const realFetch = globalThis.fetch;

beforeEach(() => {
  setReducedMotion(false);
  fetchQueue = [];
  globalThis.fetch = (async () => {
    const next = fetchQueue.shift();
    if (!next) throw new Error("unexpected fetch: queue is empty");
    return next();
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** A UI message stream response in the AI SDK v5 SSE wire format. */
function sse(...chunks: object[]): Response {
  const payload =
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
    "data: [DONE]\n\n";
  return new Response(payload, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "x-vercel-ai-ui-message-stream": "v1",
    },
  });
}

const textReply = (text: string) => () =>
  sse(
    { type: "start" },
    { type: "text-start", id: "t1" },
    { type: "text-delta", id: "t1", delta: text },
    { type: "text-end", id: "t1" },
    { type: "finish" },
  );

const toolCallReply = (toolName: string, input: object) => () =>
  sse(
    { type: "start" },
    { type: "tool-input-available", toolCallId: "call-1", toolName, input },
    { type: "finish" },
  );

// ---------- harness ----------

function Host({
  variant,
  onNavigate = () => {},
  onPageButtonClick = () => {},
  appearance,
  icon,
  header,
  inputSeparator,
}: {
  variant: BartVariant;
  onNavigate?: (route: string) => void;
  /** Click handler for the page's own interactive target element. */
  onPageButtonClick?: () => void;
  appearance?: BartAppearance;
  icon?: ReactNode;
  header?: ReactNode;
  inputSeparator?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <BartProvider
      api="/api/bart"
      currentRoute="/"
      navigate={onNavigate}
      manifest={manifest}
      appearance={appearance}
      icon={icon}
      open={open}
      onOpenChange={setOpen}
    >
      <button type="button" onClick={() => setOpen(true)}>
        external-open
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        external-close
      </button>
      <button
        type="button"
        data-bart-target="order-button"
        onClick={onPageButtonClick}
      >
        page-order-button
      </button>
      {variant === "dock" && (
        <BartDock header={header} inputSeparator={inputSeparator} />
      )}
      {variant === "sidebar" && (
        <BartSidebar header={header} inputSeparator={inputSeparator} />
      )}
      {variant === "spotlight" && <BartSpotlight />}
    </BartProvider>
  );
}

interface VariantDriver {
  variant: BartVariant;
  /** Perform the variant's own open gesture (launcher click / shortcut). */
  openGesture: () => void;
  /** Perform the variant's own pointer close gesture. */
  pointerClose: () => void;
  /** True when the variant restores focus to its own launcher on close. */
  restoresToLauncher: boolean;
}

const drivers: VariantDriver[] = [
  {
    variant: "dock",
    openGesture: () =>
      fireEvent.click(screen.getByRole("button", { name: "Bart" })),
    pointerClose: () =>
      fireEvent.click(screen.getByRole("button", { name: "Close chat" })),
    restoresToLauncher: true,
  },
  {
    variant: "sidebar",
    openGesture: () =>
      fireEvent.click(screen.getByRole("button", { name: "Bart" })),
    pointerClose: () =>
      fireEvent.click(screen.getByRole("button", { name: "Close chat" })),
    restoresToLauncher: true,
  },
  {
    variant: "spotlight",
    openGesture: () => fireEvent.keyDown(document.body, { key: "/" }),
    pointerClose: () => {
      const backdrop = document.querySelector(".bart-spotlight-backdrop");
      if (!backdrop) throw new Error("spotlight backdrop not rendered");
      fireEvent.click(backdrop);
    },
    restoresToLauncher: false,
  },
];

const getPanel = () => screen.getByRole("dialog");
const queryPanel = () => screen.queryByRole("dialog");
const pressEscape = () =>
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key: "Escape",
  });
/** The exit animation never runs in happy-dom; report its end by hand. */
const endExitAnimation = () => {
  const panel = queryPanel();
  if (panel) fireEvent.animationEnd(panel);
};

async function openPanel(driver: VariantDriver) {
  driver.openGesture();
  await waitFor(() => expect(getPanel()).toBeTruthy());
}

async function sendMessage(text: string) {
  const input = screen.getByRole("textbox", { name: "Message Bart" });
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
}

// ---------- the contract ----------

for (const driver of drivers) {
  describe(`${driver.variant} contract`, () => {
    test("opens via its own gesture into a labelled dialog", async () => {
      render(<Host variant={driver.variant} />);
      expect(queryPanel()).toBeNull();
      await openPanel(driver);
      expect(getPanel().getAttribute("aria-label")).toBe("Bart assistant");
    });

    test("Escape closes and the panel unmounts after its exit animation", async () => {
      render(<Host variant={driver.variant} />);
      await openPanel(driver);
      pressEscape();
      endExitAnimation();
      await waitFor(() => expect(queryPanel()).toBeNull());
    });

    test("the pointer close gesture closes too", async () => {
      render(<Host variant={driver.variant} />);
      await openPanel(driver);
      driver.pointerClose();
      endExitAnimation();
      await waitFor(() => expect(queryPanel()).toBeNull());
    });

    test("reduced motion closes instantly with no animation to wait on", async () => {
      setReducedMotion(true);
      render(<Host variant={driver.variant} />);
      await openPanel(driver);
      pressEscape();
      await waitFor(() => expect(queryPanel()).toBeNull());
    });

    test("closing restores focus to where it belongs", async () => {
      render(<Host variant={driver.variant} />);
      if (driver.restoresToLauncher) {
        await openPanel(driver);
        pressEscape();
        endExitAnimation();
        await waitFor(() => expect(queryPanel()).toBeNull());
        const launcher = screen.getByRole("button", { name: "Bart" });
        await waitFor(() => expect(document.activeElement).toBe(launcher));
      } else {
        // The spotlight has no launcher: it returns focus to whatever held it
        // before the shortcut opened it.
        const origin = screen.getByRole("button", { name: "external-open" });
        origin.focus();
        driver.openGesture();
        await waitFor(() => expect(getPanel()).toBeTruthy());
        pressEscape();
        endExitAnimation();
        await waitFor(() => expect(queryPanel()).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(origin));
      }
    });

    test("external controlled close unmounts the panel and cleans up", async () => {
      render(<Host variant={driver.variant} />);
      await openPanel(driver);
      fireEvent.click(screen.getByRole("button", { name: "external-close" }));
      endExitAnimation();
      await waitFor(() => expect(queryPanel()).toBeNull());
    });

    test("sends a message and renders the streamed markdown answer", async () => {
      fetchQueue.push(textReply("The **Smoke Show** is $12."));
      render(<Host variant={driver.variant} />);
      await openPanel(driver);
      await sendMessage("how much is the Smoke Show?");
      await screen.findByText("how much is the Smoke Show?");
      await waitFor(() =>
        expect(screen.getByText("Smoke Show").tagName).toBe("STRONG"),
      );
    });

    test("a failed request surfaces a dismissible error", async () => {
      fetchQueue.push(() => Promise.reject(new Error("network down")));
      render(<Host variant={driver.variant} />);
      await openPanel(driver);
      await sendMessage("hello");
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("network down");
      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
      await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    });

    test("a confirm-policy tool call renders an approval card; Deny resolves it without executing", async () => {
      const seen: string[] = [];
      fetchQueue.push(toolCallReply("navigate", { route: "/faq" }));
      // Resolving the tool call completes the turn, which auto-sends a
      // follow-up request for the model's final answer.
      fetchQueue.push(textReply("Okay, staying here."));
      render(<Host variant={driver.variant} onNavigate={(r) => seen.push(r)} />);
      await openPanel(driver);
      await sendMessage("take me to the FAQ");
      await screen.findByText("Bart wants to navigate to /faq");
      fireEvent.click(screen.getByRole("button", { name: "Deny" }));
      await waitFor(() =>
        expect(screen.queryByText("Bart wants to navigate to /faq")).toBeNull(),
      );
      await screen.findByText("You denied navigation to /faq");
      expect(seen).toEqual([]);
      await screen.findByText("Okay, staying here.");
    });

    test("approving a navigation executes it and records the approval", async () => {
      const seen: string[] = [];
      fetchQueue.push(toolCallReply("navigate", { route: "/faq" }));
      fetchQueue.push(textReply("Here you go."));
      render(<Host variant={driver.variant} onNavigate={(r) => seen.push(r)} />);
      await openPanel(driver);
      await sendMessage("take me to the FAQ");
      await screen.findByText("Bart wants to navigate to /faq");
      fireEvent.click(screen.getByRole("button", { name: "Allow" }));
      await screen.findByText("You approved navigation to /faq");
      expect(seen).toEqual(["/faq"]);
      await screen.findByText("Here you go.");
    });

    test("approving an interact call clicks the page element", async () => {
      let pageClicks = 0;
      fetchQueue.push(toolCallReply("interact", { target: "order-button" }));
      fetchQueue.push(textReply("Your order is started."));
      render(
        <Host
          variant={driver.variant}
          onPageButtonClick={() => {
            pageClicks += 1;
          }}
        />,
      );
      await openPanel(driver);
      await sendMessage("start my order");
      await screen.findByText("Bart wants to click “order-button”");
      expect(pageClicks).toBe(0);
      fireEvent.click(screen.getByRole("button", { name: "Allow" }));
      await screen.findByText("You approved clicking “order-button”");
      expect(pageClicks).toBe(1);
      await screen.findByText("Your order is started.");
    });

    test("the auto-approve toggle executes navigation without an approval card", async () => {
      const seen: string[] = [];
      fetchQueue.push(toolCallReply("navigate", { route: "/faq" }));
      fetchQueue.push(textReply("Done."));
      render(<Host variant={driver.variant} onNavigate={(r) => seen.push(r)} />);
      await openPanel(driver);
      const toggle = screen.getByRole("switch", {
        name: "Automatically approve Bart's page actions",
      });
      expect(toggle.getAttribute("aria-checked")).toBe("false");
      fireEvent.click(toggle);
      expect(toggle.getAttribute("aria-checked")).toBe("true");
      await sendMessage("take me to the FAQ");
      // No approval card: the call resolves during the stream and reports
      // plain execution, not user approval.
      await screen.findByText("Navigated to /faq");
      expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
      expect(seen).toEqual(["/faq"]);
      await screen.findByText("Done.");
    });

    test("renders the solid surface by default and glass on opt-in", async () => {
      const view = render(<Host variant={driver.variant} />);
      await openPanel(driver);
      expect(document.querySelector(".bart-glass")).toBeNull();
      expect(document.querySelector(".bart-solid")).toBeTruthy();
      view.unmount();
      render(<Host variant={driver.variant} appearance="glass" />);
      await openPanel(driver);
      expect(document.querySelector(".bart-solid")).toBeNull();
      expect(document.querySelector(".bart-glass")).toBeTruthy();
    });

    test("a custom icon node replaces the brand mark", async () => {
      render(
        <Host
          variant={driver.variant}
          icon={<span data-testid="custom-icon" />}
        />,
      );
      // Closed state first: the launcher (dock/sidebar) or the hint (spotlight).
      expect(screen.getAllByTestId("custom-icon").length).toBeGreaterThan(0);
      if (driver.variant !== "spotlight") {
        await openPanel(driver);
        // …and again in the panel header.
        expect(screen.getAllByTestId("custom-icon").length).toBeGreaterThan(0);
      }
    });

    test("New Chat is available and resets the conversation", async () => {
      fetchQueue.push(textReply("Hi!"));
      render(<Host variant={driver.variant} />);
      await openPanel(driver);
      await sendMessage("hello");
      await screen.findByText("Hi!");
      const newChat = screen.getByRole("button", {
        name: driver.variant === "spotlight" ? "New chat" : "Start new chat",
      });
      fireEvent.click(newChat);
      await waitFor(() => expect(screen.queryByText("Hi!")).toBeNull());
      // The panel itself stays open for the fresh conversation.
      expect(getPanel()).toBeTruthy();
    });
  });
}

// ---------- variant-specific contracts ----------

// Header and separator configuration exists only on the panel shells.
for (const driver of drivers.slice(0, 2)) {
  describe(`${driver.variant} header/separator configuration`, () => {
    test("header={false} removes the standard header", async () => {
      render(<Host variant={driver.variant} header={false} />);
      fireEvent.click(screen.getByRole("button", { name: "Bart" }));
      await waitFor(() => expect(getPanel()).toBeTruthy());
      expect(screen.queryByRole("button", { name: "Close chat" })).toBeNull();
      // Escape still closes: the lifecycle hook, not the header, owns it.
      pressEscape();
      endExitAnimation();
      await waitFor(() => expect(queryPanel()).toBeNull());
    });

    test("a custom header node replaces the standard one", async () => {
      render(
        <Host
          variant={driver.variant}
          header={<header data-testid="my-header">Custom</header>}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Bart" }));
      await waitFor(() => expect(getPanel()).toBeTruthy());
      expect(screen.getByTestId("my-header").textContent).toBe("Custom");
      expect(screen.queryByRole("button", { name: "Close chat" })).toBeNull();
    });

    test("inputSeparator={false} marks the panel as separator-free", async () => {
      render(<Host variant={driver.variant} inputSeparator={false} />);
      await openPanel(driver);
      expect(getPanel().className).toContain("bart-no-separator");
    });
  });
}

describe("dock specifics", () => {
  test("arrow keys on the focused corner handle resize the panel", async () => {
    render(<Host variant="dock" />);
    await openPanel(drivers[0]!);
    const panel = getPanel();
    expect(panel.style.width).toBe("384px");
    const handle = screen.getByRole("button", { name: "Resize chat panel" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(panel.style.width).toBe("400px");
    fireEvent.keyDown(handle, { key: "ArrowUp", shiftKey: true });
    expect(panel.style.height).toBe("480px");
  });
});

describe("sidebar specifics", () => {
  const driver = drivers[1]!;

  test("open pushes the page via body classes; close and unmount clean them up", async () => {
    const view = render(<Host variant="sidebar" />);
    await openPanel(driver);
    expect(document.body.classList.contains("bart-sidebar-push")).toBe(true);
    expect(document.body.classList.contains("bart-sidebar-push-right")).toBe(
      true,
    );
    pressEscape();
    endExitAnimation();
    await waitFor(() => expect(queryPanel()).toBeNull());
    expect(document.body.classList.contains("bart-sidebar-push-right")).toBe(
      false,
    );
    view.unmount();
    expect(document.body.classList.contains("bart-sidebar-push")).toBe(false);
    expect(
      document.documentElement.style.getPropertyValue("--bart-sidebar-width"),
    ).toBe("");
  });

  test("keyboard resize drives the shared width variable, clamped to the minimum", async () => {
    render(<Host variant="sidebar" />);
    await openPanel(driver);
    const handle = screen.getByRole("button", { name: "Resize chat panel" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    // happy-dom reports zero layout width, so the clamp floor is the result.
    expect(
      document.documentElement.style.getPropertyValue("--bart-sidebar-width"),
    ).toBe("280px");
  });
});

describe("spotlight specifics", () => {
  const driver = drivers[2]!;

  test("clicking inside the card does not close it", async () => {
    render(<Host variant="spotlight" />);
    await openPanel(driver);
    fireEvent.click(screen.getByRole("textbox", { name: "Message Bart" }));
    expect(getPanel()).toBeTruthy();
  });

  test("New chat stays hidden until a conversation exists", async () => {
    render(<Host variant="spotlight" />);
    await openPanel(driver);
    expect(screen.queryByRole("button", { name: "New chat" })).toBeNull();
  });

  test("the shortcut is ignored while typing in an input", async () => {
    render(<Host variant="spotlight" />);
    const outside = screen.getByRole("button", { name: "external-open" });
    outside.focus();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "/" });
    expect(queryPanel()).toBeNull();
    input.remove();
  });
});
