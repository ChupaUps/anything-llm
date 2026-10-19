import i18n from "@/i18n";
import Appearance from "@/models/appearance";
import {
  PREVIEW_CHANNEL,
  PREVIEW_MAX_HEIGHT,
  PREVIEW_MIN_HEIGHT,
  PREVIEW_SELECTORS,
} from "./runtimeConfig";
import { buildHtmlPreviewDocument } from "./htmlDocument";
import { buildReactPreviewDocument } from "./reactDocument";
import { transpilePreviewCode } from "./transpile";
import { formatError } from "./errors";

const INITIAL_FRAME_HEIGHT = 160;

let installed = false;

/** Guards against overlapping builds for the same pane. */
const runTokens = new WeakMap();

/** previewId -> frame host, used to validate height messages. */
const frameHosts = new Map();

/**
 * Single document-level delegator for RUN/Hide clicks. Idempotent, mirroring
 * the code-snippet copy delegator so React re-renders never stack listeners.
 * The iframe itself is only created after a click: sanitized markdown cannot
 * carry it and nothing runs until the user asks for it.
 */
export function installCodePreviewDelegator() {
  if (installed) return;
  installed = true;
  document.addEventListener("click", handleDocumentClick);
  window.addEventListener("message", handlePreviewMessage);
}

/**
 * @param {MouseEvent} event
 */
function handleDocumentClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const runButton = target.closest(PREVIEW_SELECTORS.run);
  if (runButton) {
    event.preventDefault();
    void runPreview(runButton);
    return;
  }

  const hideButton = target.closest(PREVIEW_SELECTORS.hide);
  if (hideButton) {
    event.preventDefault();
    hidePreview(hideButton);
  }
}

/**
 * @param {Element} button
 */
async function runPreview(button) {
  const block = button.closest(PREVIEW_SELECTORS.block);
  if (!block || Appearance.get("codePreview") === false) return;

  const source = block.querySelector(PREVIEW_SELECTORS.source)?.innerText;
  const pane = block.querySelector(PREVIEW_SELECTORS.pane);
  const frameHost = block.querySelector(PREVIEW_SELECTORS.frameHost);
  if (!source?.trim() || !pane || !frameHost) return;

  const previewId = block.dataset.previewId ?? "";
  const mode = block.dataset.codeMode === "react" ? "react" : "html";
  const syntax =
    block.dataset.codeLang === "tsx"
      ? "tsx"
      : block.dataset.codeLang === "react"
        ? "react"
        : "jsx";

  const token = (runTokens.get(pane) ?? 0) + 1;
  runTokens.set(pane, token);

  showPane(pane);
  setStatus(pane, i18n.t("chat.code-preview.loading", "Loading preview"));
  setError(pane, "");
  setRunning(button, true);

  try {
    const srcdoc =
      mode === "react"
        ? buildReactPreviewDocument(
            previewId,
            await transpilePreviewCode(source, syntax)
          )
        : buildHtmlPreviewDocument(previewId, source);

    if (runTokens.get(pane) !== token || !pane.isConnected) return;
    mountFrame({ pane, frameHost, previewId, srcdoc });
  } catch (error) {
    if (runTokens.get(pane) !== token) return;
    destroyFrame(frameHost, previewId);
    setStatus(pane, "");
    setError(
      pane,
      `${i18n.t("chat.code-preview.error", "Preview failed")}\n\n${formatError(error)}`
    );
  } finally {
    if (runTokens.get(pane) === token) setRunning(button, false);
  }
}

/**
 * @param {Element} button
 */
function hidePreview(button) {
  const block = button.closest(PREVIEW_SELECTORS.block);
  if (!block) return;
  const pane = block.querySelector(PREVIEW_SELECTORS.pane);
  const frameHost = block.querySelector(PREVIEW_SELECTORS.frameHost);
  if (!pane || !frameHost) return;

  // Cancels any build still in flight for this pane.
  runTokens.set(pane, (runTokens.get(pane) ?? 0) + 1);
  destroyFrame(frameHost, block.dataset.previewId ?? "");
  setStatus(pane, "");
  setError(pane, "");
  setRunning(block.querySelector(PREVIEW_SELECTORS.run), false);
  pane.hidden = true;
  pane.style.display = "none";
}

/**
 * @param {{pane: Element, frameHost: Element, previewId: string, srcdoc: string}} parts
 */
function mountFrame({ pane, frameHost, previewId, srcdoc }) {
  destroyFrame(frameHost, previewId);

  const iframe = document.createElement("iframe");
  iframe.setAttribute(
    "sandbox",
    "allow-scripts allow-forms allow-modals allow-popups"
  );
  iframe.setAttribute("referrerpolicy", "no-referrer");
  iframe.setAttribute("title", "Code preview");
  iframe.className = "block w-full border-0 bg-white";
  iframe.style.height = `${INITIAL_FRAME_HEIGHT}px`;
  iframe.addEventListener("load", () => setStatus(pane, ""));
  iframe.srcdoc = srcdoc;

  frameHost.dataset.previewFrameId = previewId;
  frameHost.textContent = "";
  frameHost.appendChild(iframe);
  frameHosts.set(previewId, frameHost);

  pane.scrollIntoView?.({ block: "nearest" });
}

/**
 * @param {Element} frameHost
 * @param {string} previewId
 */
function destroyFrame(frameHost, previewId) {
  if (frameHost) frameHost.textContent = "";
  frameHosts.delete(previewId);
}

/**
 * Global height listener. A message is only honored when it comes from the
 * iframe currently registered for that preview id.
 * @param {MessageEvent} event
 */
function handlePreviewMessage(event) {
  const data = event.data;
  if (!data || data.channel !== PREVIEW_CHANNEL) return;
  if (typeof data.height !== "number" || !Number.isFinite(data.height)) return;

  const frameHost = frameHosts.get(data.id);
  if (!frameHost || !frameHost.isConnected) return;

  const iframe = frameHost.querySelector("iframe");
  if (!iframe || event.source !== iframe.contentWindow) return;

  const height = Math.max(
    PREVIEW_MIN_HEIGHT,
    Math.min(PREVIEW_MAX_HEIGHT, Math.round(data.height))
  );
  iframe.style.height = `${height}px`;
}

/**
 * @param {Element} pane
 */
function showPane(pane) {
  pane.hidden = false;
  pane.style.display = "";
}

/**
 * @param {Element} pane
 * @param {string} text
 */
function setStatus(pane, text) {
  const status = pane.querySelector(PREVIEW_SELECTORS.status);
  if (!status) return;
  status.textContent = text;
  status.hidden = !text;
  status.style.display = text ? "" : "none";
}

/**
 * @param {Element} pane
 * @param {string} text
 */
function setError(pane, text) {
  const error = pane.querySelector(PREVIEW_SELECTORS.error);
  if (!error) return;
  error.textContent = text;
  error.hidden = !text;
  error.style.display = text ? "" : "none";
}

/**
 * @param {Element|null} button
 * @param {boolean} running
 */
function setRunning(button, running) {
  if (!button) return;
  button.disabled = running;
  button.classList.toggle("opacity-50", running);
  button.classList.toggle("cursor-progress", running);
}
