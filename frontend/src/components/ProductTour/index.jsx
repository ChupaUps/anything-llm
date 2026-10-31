import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { isMobile } from "react-device-detect";
import { ArrowLeft, ArrowRight, Check, X } from "@phosphor-icons/react";
import useLoginMode from "@/hooks/useLoginMode";
import useUser from "@/hooks/useUser";
import Workspace from "@/models/workspace";
import System from "@/models/system";
import paths from "@/utils/paths";
import {
  CLOSE_ACCOUNT_MODAL_EVENT,
  CLOSE_WORKSPACE_UPLOAD_MODAL_EVENT,
  OPEN_ACCOUNT_MODAL_EVENT,
  OPEN_WORKSPACE_UPLOAD_MODAL_EVENT,
  START_PRODUCT_TOUR_EVENT,
} from "@/utils/constants";

// How long a step waits for its anchor to mount (page load, modal animation,
// workspace switch) before it falls back to a centered card.
const ANCHOR_WAIT_MS = 8000;
const ANCHOR_POLL_MS = 120;
const ANCHOR_FOLLOW_MS = 400;
// The chat's tools popover, opened and closed for the matching tour step.
const TOOLS_BUTTON_ID = "tools-btn";
const TOOLS_MENU_SELECTOR = '[data-tour="tools-menu"]';
const AUTO_START_DELAY_MS = 1200;
const TOOLTIP_WIDTH = 340;
const TOOLTIP_GAP = 14;
const VIEWPORT_MARGIN = 16;
const DEFAULT_TOOLTIP_HEIGHT = 240;
const HIGHLIGHT_PADDING = 6;

/**
 * Places the tour card next to the highlighted element, preferring the side
 * requested by the step and falling back to any side with room. The result is
 * always clamped into the viewport so the card never renders off-screen.
 * @param {{top: number, left: number, width: number, height: number}|null} rect
 * @param {"top"|"bottom"|"left"|"right"|"auto"} preferred
 * @param {number} height - measured card height
 * @returns {{left: number, top: number}}
 */
function tooltipPosition(rect = null, preferred = "auto", height = 0) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxLeft = Math.max(
    vw - TOOLTIP_WIDTH - VIEWPORT_MARGIN,
    VIEWPORT_MARGIN
  );
  const maxTop = Math.max(vh - height - VIEWPORT_MARGIN, VIEWPORT_MARGIN);

  if (!rect)
    return {
      left: Math.max((vw - TOOLTIP_WIDTH) / 2, VIEWPORT_MARGIN),
      top: Math.max((vh - height) / 2, VIEWPORT_MARGIN),
    };

  const fits = {
    top: rect.top - height - TOOLTIP_GAP >= VIEWPORT_MARGIN,
    bottom:
      rect.top + rect.height + TOOLTIP_GAP + height <= vh - VIEWPORT_MARGIN,
    left: rect.left - TOOLTIP_WIDTH - TOOLTIP_GAP >= VIEWPORT_MARGIN,
    right:
      rect.left + rect.width + TOOLTIP_GAP + TOOLTIP_WIDTH <=
      vw - VIEWPORT_MARGIN,
  };
  const order = {
    left: ["left", "right", "bottom", "top"],
    right: ["right", "left", "bottom", "top"],
    top: ["top", "bottom", "right", "left"],
    bottom: ["bottom", "top", "right", "left"],
    auto: ["bottom", "top", "right", "left"],
  }[preferred] || ["bottom", "top", "right", "left"];
  const side = order.find((candidate) => fits[candidate]) ?? "bottom";

  let left;
  let top;
  switch (side) {
    case "left":
      left = rect.left - TOOLTIP_WIDTH - TOOLTIP_GAP;
      top = rect.top + rect.height / 2 - height / 2;
      break;
    case "right":
      left = rect.left + rect.width + TOOLTIP_GAP;
      top = rect.top + rect.height / 2 - height / 2;
      break;
    case "top":
      left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
      top = rect.top - height - TOOLTIP_GAP;
      break;
    default:
      left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
      top = rect.top + rect.height + TOOLTIP_GAP;
  }

  return {
    left: Math.min(Math.max(left, VIEWPORT_MARGIN), maxLeft),
    top: Math.min(Math.max(top, VIEWPORT_MARGIN), maxTop),
  };
}

/**
 * Guided walkthrough of the app for first-time users. Renders a spotlight over
 * the current step's anchor plus an explanatory card, and is driven entirely by
 * `data-tour` attributes so the copy stays decoupled from the markup.
 *
 * The tour is mounted once in `App` and survives route changes; parts of the
 * flow that live behind UI state (the account modal) are steered through the
 * window events defined in `utils/constants`.
 */
export default function ProductTour() {
  const { t } = useTranslation();
  const { user } = useUser();
  const mode = useLoginMode();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [stepIndex, setStepIndex] = useState(null);
  const [anchorRect, setAnchorRect] = useState(null);
  // Set once the tour is closed in this session, so a user who skipped it is
  // not stopped by it again on every visit to the home page.
  const [dismissed, setDismissed] = useState(false);
  const [tooltipHeight, setTooltipHeight] = useState(0);
  const tooltipRef = useRef(null);

  const steps = useMemo(
    () => [
      {
        id: "welcome",
        title: t("product_tour.steps.welcome.title"),
        description: t("product_tour.steps.welcome.description"),
      },
      {
        id: "chats",
        title: t("product_tour.steps.chats.title"),
        description: t("product_tour.steps.chats.description"),
        anchors: [
          '[data-tour="personal-workspace"]',
          '[data-tour="workspace-list"]',
        ],
        placement: "right",
      },
      {
        id: "prompt",
        title: t("product_tour.steps.prompt.title"),
        description: t("product_tour.steps.prompt.description"),
        anchors: ['[data-tour="prompt-input"]'],
        placement: "top",
      },
      {
        id: "account",
        title: t("product_tour.steps.account.title"),
        description: t("product_tour.steps.account.description"),
        anchors: ['[data-tour="user-menu"]'],
        placement: "bottom",
      },
      {
        id: "account-tabs",
        title: t("product_tour.steps.account_tabs.title"),
        description: t("product_tour.steps.account_tabs.description"),
        anchors: ['[data-tour="account-tabs"]'],
        placement: "bottom",
      },
      {
        id: "account-preferences",
        title: t("product_tour.steps.account_preferences.title"),
        description: t("product_tour.steps.account_preferences.description"),
        anchors: ['[data-tour="account-preferences"]'],
        placement: "left",
      },
      {
        id: "account-memories",
        title: t("product_tour.steps.account_memories.title"),
        description: t("product_tour.steps.account_memories.description"),
        anchors: ['[data-tour="account-memories"]'],
        placement: "left",
      },
      {
        id: "personal-chat",
        title: t("product_tour.steps.personal_chat.title"),
        description: t("product_tour.steps.personal_chat.description"),
        anchors: [
          '[data-tour="upload-document"]',
          '[data-tour="chat-attach"]',
          '[data-tour="prompt-input"]',
        ],
        placement: "top",
      },
      {
        id: "agent",
        title: t("product_tour.steps.agent.title"),
        description: t("product_tour.steps.agent.description"),
        anchors: ['[data-tour="prompt-input"]'],
        placement: "top",
      },
      {
        id: "website",
        title: t("product_tour.steps.website.title"),
        description: t("product_tour.steps.website.description"),
        anchors: ['[data-code-run]', '[data-tour="prompt-input"]'],
        placement: "top",
      },
      {
        id: "tools",
        title: t("product_tour.steps.tools.title"),
        description: t("product_tour.steps.tools.description"),
        anchors: ['[data-tour="tools-menu"]', '[data-tour="tools-button"]'],
        placement: "left",
      },
      {
        id: "rag",
        title: t("product_tour.steps.rag.title"),
        description: t("product_tour.steps.rag.description"),
        anchors: [
          '[data-tour="workspace-upload-area"]',
          '[data-tour="workspace-upload"]',
          '[data-tour="personal-workspace"]',
          '[data-tour="workspace-list"]',
        ],
        placement: "top",
      },
      {
        id: "connectors",
        title: t("product_tour.steps.connectors.title"),
        description: t("product_tour.steps.connectors.description"),
        anchors: [
          '[data-tour="data-connectors-add"]',
          '[data-tour="data-connectors"]',
          '[data-tour="workspace-settings-tabs"]',
          '[data-tour="workspace-list"]',
        ],
        placement: "left",
      },
      {
        id: "support",
        title: t("product_tour.steps.support.title"),
        description: t("product_tour.steps.support.description"),
        anchors: [
          '[data-tour="support-icons"]',
          '[data-tour="workspace-list"]',
        ],
        placement: "top",
      },
      {
        id: "done",
        title: t("product_tour.steps.done.title"),
        description: t("product_tour.steps.done.description"),
      },
    ],
    [t]
  );

  const step = stepIndex === null ? null : steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;
  const isFirstStep = stepIndex === 0;

  const openAccountModal = useCallback((tab = "profile") => {
    window.dispatchEvent(
      new CustomEvent(OPEN_ACCOUNT_MODAL_EVENT, { detail: { tab } })
    );
  }, []);

  const closeAccountModal = useCallback(() => {
    window.dispatchEvent(new CustomEvent(CLOSE_ACCOUNT_MODAL_EVENT));
  }, []);

  // The tools popover only belongs to its own step, so it is opened on entry and
  // closed as soon as the tour moves on.
  const closeToolsMenu = useCallback(() => {
    if (!document.querySelector(TOOLS_MENU_SELECTOR)) return;
    document.getElementById(TOOLS_BUTTON_ID)?.click();
  }, []);

  const closeUploadModal = useCallback(() => {
    window.dispatchEvent(new CustomEvent(CLOSE_WORKSPACE_UPLOAD_MODAL_EVENT));
  }, []);

  // Closing mid-way does not count as watching: nothing is recorded, so the
  // tour is offered again on the next sign-in.
  const closeTour = useCallback(() => {
    setDismissed(true);
    closeAccountModal();
    closeToolsMenu();
    closeUploadModal();
    setAnchorRect(null);
    setStepIndex(null);
  }, [closeAccountModal, closeToolsMenu, closeUploadModal]);

  const finish = useCallback(() => {
    // The flag lives on the user record, not in the browser, so the walkthrough
    // is not offered again on another device either.
    System.setProductTourCompleted(true);
    setDismissed(true);
    closeAccountModal();
    closeToolsMenu();
    closeUploadModal();
    setAnchorRect(null);
    setStepIndex(null);
    // The last steps run inside the workspace settings, so hand the user back to
    // their chat instead of leaving them on a settings tab.
    if (!pathname.includes("/settings/")) return;
    Workspace.all().then((workspaces = []) => {
      const personal = workspaces.find((workspace) => workspace.is_personal);
      if (personal?.slug) navigate(paths.workspace.chat(personal.slug));
    });
  }, [closeAccountModal, closeToolsMenu, closeUploadModal, navigate, pathname]);

  // Route builder of the steps that leave the chat and end up on the user's own
  // workspace. Personal projects are addressed by slug, so each entry takes a
  // slug and returns the path to open.
  const personalRoute = useCallback((stepId) => {
    if (stepId === "personal-chat") return paths.workspace.chat;
    if (stepId === "connectors") return paths.workspace.settings.dataConnectors;
    return null;
  }, []);

  // Steps that need the UI in a specific state prepare it here, so "Next" and
  // "Back" both leave the screen in a state the next step can point at.
  useEffect(() => {
    if (stepIndex === null) return;
    const stepId = steps[stepIndex]?.id;

    if (stepId === "tools") {
      const button = document.getElementById(TOOLS_BUTTON_ID);
      if (button && !document.querySelector(TOOLS_MENU_SELECTOR))
        button.click();
    } else {
      closeToolsMenu();
    }

    // The documents modal is the RAG step's anchor, so it is opened for it and
    // closed everywhere else.
    if (stepId === "rag") {
      window.dispatchEvent(new CustomEvent(OPEN_WORKSPACE_UPLOAD_MODAL_EVENT));
    } else {
      closeUploadModal();
    }

    if (stepId === "account-tabs" || stepId === "account-preferences") {
      openAccountModal("profile");
      return;
    }
    if (stepId === "account-memories") {
      openAccountModal("memories");
      return;
    }

    closeAccountModal();
    // Walk the user into their own chat, then into the connections tab of its
    // settings, before pointing at the uploader and at the data connections.
    const resolvePath = personalRoute(stepId);
    if (!resolvePath) return;
    Workspace.all().then((workspaces = []) => {
      const personal = workspaces.find((workspace) => workspace.is_personal);
      if (personal?.slug) navigate(resolvePath(personal.slug));
    });
    // Only a step change should run these side effects.
  }, [stepIndex]);

  // Resolve and track the anchor of the current step. Steps without anchors
  // (welcome/summary) intentionally render as a centered card.
  const anchorsKey = step?.anchors?.join("|") ?? "";
  useEffect(() => {
    if (stepIndex === null) return;
    const current = steps[stepIndex];
    setAnchorRect(null);
    if (!current?.anchors?.length) return;

    let cancelled = false;
    let timer = null;

    const findAnchor = () => {
      for (const selector of current.anchors) {
        const element = document.querySelector(selector);
        if (element) return element;
      }
      return null;
    };

    const measure = () => {
      if (cancelled) return false;
      const element = findAnchor();
      if (!element) return false;
      const box = element.getBoundingClientRect();
      if (!box.width && !box.height) return false;
      // Equality check keeps the polling below from re-rendering every tick.
      setAnchorRect((previous) => {
        if (
          previous &&
          previous.top === box.top &&
          previous.left === box.left &&
          previous.width === box.width &&
          previous.height === box.height
        )
          return previous;
        return {
          top: box.top,
          left: box.left,
          width: box.width,
          height: box.height,
        };
      });
      return true;
    };

    const startedAt = Date.now();
    const waitForAnchor = () => {
      if (cancelled) return;
      const element = findAnchor();
      if (element) {
        element.scrollIntoView({ block: "nearest", inline: "nearest" });
        requestAnimationFrame(measure);
        return;
      }
      if (Date.now() - startedAt >= ANCHOR_WAIT_MS) return;
      timer = setTimeout(waitForAnchor, ANCHOR_POLL_MS);
    };
    waitForAnchor();

    // Anchors can be swapped under us (a step that navigates to another route
    // remounts the element), so keep following whatever matches the selectors.
    const follow = setInterval(measure, ANCHOR_FOLLOW_MS);

    const handleViewportChange = () => measure();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(follow);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
    // `anchorsKey` stands in for the step's anchor list, which is stable per id.
  }, [stepIndex, anchorsKey]);

  // The card height feeds the placement math, so measure after every step.
  useEffect(() => {
    const node = tooltipRef.current;
    if (!node) return;
    setTooltipHeight(node.offsetHeight || DEFAULT_TOOLTIP_HEIGHT);
  }, [stepIndex, anchorRect]);

  // Everyone who has not watched the tour through to the end gets it on the
  // home page - a fresh account and a months-old one alike. Users who already
  // watched it can start it again from their profile (account modal footer).
  useEffect(() => {
    if (mode !== "multi" || !user?.id || stepIndex !== null || isMobile) return;
    if (pathname !== paths.home()) return;
    if (dismissed || user?.productTourCompletedAt) return;

    const timer = setTimeout(() => setStepIndex(0), AUTO_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [dismissed, mode, pathname, stepIndex, user]);

  const handleRequestStart = useCallback(() => {
    // Replaying the tour marks the user as "not watched" again until they reach
    // the end once more, so an interrupted replay is not lost.
    if (user?.id) System.setProductTourCompleted(false);
    setDismissed(false);
    closeAccountModal();
    closeToolsMenu();
    closeUploadModal();
    setAnchorRect(null);
    setStepIndex(null);
    navigate(paths.home());
    // Let the home page settle before the first spotlight is measured.
    setTimeout(() => setStepIndex(0), AUTO_START_DELAY_MS);
  }, [closeAccountModal, closeToolsMenu, closeUploadModal, navigate, user?.id]);

  useEffect(() => {
    window.addEventListener(START_PRODUCT_TOUR_EVENT, handleRequestStart);
    return () =>
      window.removeEventListener(START_PRODUCT_TOUR_EVENT, handleRequestStart);
  }, [handleRequestStart]);

  if (!step) return null;

  const height = tooltipHeight || DEFAULT_TOOLTIP_HEIGHT;
  const position = tooltipPosition(anchorRect, step.placement, height);
  const highlightStyle = anchorRect
    ? {
        top: anchorRect.top - HIGHLIGHT_PADDING,
        left: anchorRect.left - HIGHLIGHT_PADDING,
        width: anchorRect.width + HIGHLIGHT_PADDING * 2,
        height: anchorRect.height + HIGHLIGHT_PADDING * 2,
      }
    : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999]"
      role="dialog"
      aria-modal="true"
      aria-label={step.title}
    >
      {/* Swallows clicks so the page behind the spotlight stays inert. */}
      <div className="absolute inset-0" />
      {highlightStyle ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-sky-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] transition-[top,left,width,height] duration-200 ease-out"
          style={highlightStyle}
        />
      ) : (
        <div className="absolute inset-0 bg-black/70" />
      )}

      <div
        ref={tooltipRef}
        style={{ left: position.left, top: position.top, width: TOOLTIP_WIDTH }}
        className="absolute flex flex-col gap-y-3 rounded-xl border border-zinc-700 bg-zinc-900 p-5 text-white shadow-2xl transition-[top,left] duration-200 ease-out light:border-slate-200 light:bg-white light:text-slate-900"
      >
        <div className="flex items-start justify-between gap-x-3">
          <span className="text-[11px] font-medium uppercase tracking-[1.2px] text-sky-400">
            {t("product_tour.title")}
          </span>
          <button
            type="button"
            onClick={closeTour}
            aria-label={t("product_tour.close")}
            className="-m-1 shrink-0 rounded-lg border-none bg-transparent p-1 text-zinc-400 transition-colors duration-200 hover:bg-zinc-800 hover:text-white light:text-slate-500 light:hover:bg-slate-100 light:hover:text-slate-900"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
        <h3 className="text-base font-semibold">{step.title}</h3>
        <p className="whitespace-pre-line text-sm leading-5 text-zinc-300 light:text-slate-600">
          {step.description}
        </p>
        <div className="flex items-center justify-between gap-x-2 pt-1">
          <span className="text-xs text-zinc-500 light:text-slate-500">
            {t("product_tour.step_of", {
              current: stepIndex + 1,
              total: steps.length,
            })}
          </span>
          <div className="flex items-center gap-x-2">
            <button
              type="button"
              onClick={() =>
                setStepIndex((current) => Math.max((current ?? 0) - 1, 0))
              }
              disabled={isFirstStep}
              className={`flex h-[34px] items-center gap-x-1 rounded-lg border border-zinc-700 bg-transparent px-3 text-sm font-medium text-zinc-200 transition-opacity duration-200 hover:bg-zinc-800 light:border-slate-300 light:text-slate-700 light:hover:bg-slate-100 ${
                isFirstStep ? "invisible" : ""
              }`}
            >
              <ArrowLeft size={14} weight="bold" />
              {t("product_tour.back")}
            </button>
            <button
              type="button"
              onClick={() =>
                isLastStep ? finish() : setStepIndex(stepIndex + 1)
              }
              className="flex h-[34px] items-center gap-x-1 rounded-lg border-none bg-zinc-50 px-4 text-sm font-medium text-zinc-950 transition-opacity duration-200 hover:opacity-80 light:bg-slate-900 light:text-white"
            >
              {isLastStep ? t("product_tour.finish") : t("product_tour.next")}
              {isLastStep ? (
                <Check size={14} weight="bold" />
              ) : (
                <ArrowRight size={14} weight="bold" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
