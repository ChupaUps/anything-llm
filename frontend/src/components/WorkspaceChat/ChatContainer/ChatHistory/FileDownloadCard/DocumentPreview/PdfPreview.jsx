import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleNotch } from "@phosphor-icons/react";
import StorageFiles from "@/models/files";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.js?url";

/** Never shrink a page below this width so text stays legible on small screens. */
const MIN_PAGE_WIDTH = 180;
/** Cap the backing-store scale so phones stay inside their canvas memory budget. */
const MAX_PIXEL_RATIO = 2;
/** Upper bound on painted pages; the least recently seen ones are released past it. */
const MAX_PAINTED_PAGES = 24;
/** Debounce for re-layouts after the container width changes, in ms. */
const RESIZE_DEBOUNCE = 150;
/** How far outside the viewport a page is painted ahead of scrolling, in px. */
const PRELOAD_MARGIN = "600px 0px";

/**
 * Faithful document preview backed by server-side rendering.
 *
 * For PDFs the server returns the file as-is; for office documents
 * (docx/xlsx/pptx/...) it converts them to PDF with headless LibreOffice and
 * caches the result. We fetch that PDF as an authenticated blob and then paint
 * its pages with PDF.js onto canvases.
 *
 * We deliberately do not hand the blob to an <iframe>/<embed> native viewer:
 * mobile browsers (iOS Safari, Android Chrome) do not render PDFs inline, so the
 * preview used to come up blank or trigger a download on phones. Painting the
 * pages ourselves behaves the same on every device.
 *
 * Pages are laid out at the container width and painted lazily as they scroll
 * into view, which keeps memory in check for long documents on mobile. The whole
 * PDF.js stack is imported on demand so it stays out of the initial bundle.
 *
 * Conversion can take a few seconds on first open (then it is cached), so a
 * loading spinner is shown. If the server cannot produce a PDF (LibreOffice
 * missing, unsupported type, or an error) we render the `fallback` node - the
 * text-based hybrid preview - so the user always sees something useful.
 *
 * @param {{storageFilename: string, fallback?: import("react").ReactNode}} props
 */
export default function FaithfulPreview({ storageFilename, fallback = null }) {
  const { t } = useTranslation();
  const hostRef = useRef(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    /** @type {import("pdfjs-dist").PDFDocumentProxy|null} */
    let pdf = null;
    /** @type {{destroy: () => Promise<void>}|null} */
    let loadingTask = null;
    /** @type {IntersectionObserver|null} */
    let observer = null;
    /** @type {ResizeObserver|null} */
    let resizeObserver = null;
    /** @type {ReturnType<typeof setTimeout>|null} */
    let resizeTimer = null;
    /** Bumped on every re-layout so stale renders can detect they are obsolete. */
    let generation = 0;

    /**
     * @typedef {Object} PageSlot
     * @property {number} number - 1-based page number
     * @property {HTMLDivElement} div - sizing wrapper that reserves the page box
     * @property {HTMLCanvasElement} canvas - backing canvas the page is painted into
     * @property {number} width - laid-out width in CSS px
     * @property {number} ratio - height / width of the page
     * @property {{cancel: () => void, promise: Promise<void>}|null} task - active render
     * @property {boolean} rendered - whether the canvas holds a valid bitmap
     * @property {number} seen - monotonic counter of the last time the page was visible
     */

    /** @type {PageSlot[]} */
    const slots = [];
    /** @type {Map<Element, PageSlot>} */
    const slotsByDiv = new Map();
    /** @type {Set<PageSlot>} */
    const onScreen = new Set();
    let tick = 0;

    host.replaceChildren();
    setStatus("loading");

    /**
     * Width available for a page, in CSS px. `clientWidth` excludes the border
     * but includes the padding, so the padding is measured off explicitly.
     */
    function pageWidth() {
      const styles = window.getComputedStyle(host);
      const available =
        host.clientWidth -
        (parseFloat(styles.paddingLeft) || 0) -
        (parseFloat(styles.paddingRight) || 0);
      return Math.max(MIN_PAGE_WIDTH, Math.floor(available));
    }

    /** Drop a page's bitmap while keeping its reserved layout box. */
    function release(slot) {
      if (slot.task) {
        try {
          slot.task.cancel();
        } catch {
          /* render already finished */
        }
        slot.task = null;
      }
      slot.rendered = false;
      slot.canvas.width = 0;
      slot.canvas.height = 0;
    }

    /**
     * Paint one page into its canvas. The layout box stays reserved, so pages
     * that have not been painted yet still occupy the right amount of space.
     * @param {PageSlot} slot
     */
    async function paint(slot) {
      if (cancelled || !pdf || slot.rendered || slot.task) return;
      const current = generation;
      try {
        const page = await pdf.getPage(slot.number);
        if (cancelled || current !== generation) return;

        const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: (slot.width / base.width) * ratio,
        });
        slot.canvas.width = Math.max(1, Math.floor(viewport.width));
        slot.canvas.height = Math.max(1, Math.floor(viewport.height));

        slot.task = page.render({
          canvasContext: slot.canvas.getContext("2d"),
          viewport,
        });
        await slot.task.promise;
        slot.task = null;
        if (cancelled || current !== generation) return;
        slot.rendered = true;

        // Long documents would otherwise accumulate one bitmap per page.
        const painted = slots.filter((candidate) => candidate.rendered);
        if (painted.length > MAX_PAINTED_PAGES) {
          painted
            .filter((candidate) => !onScreen.has(candidate))
            .sort((a, b) => a.seen - b.seen)
            .slice(0, painted.length - MAX_PAINTED_PAGES)
            .forEach(release);
        }
      } catch (error) {
        slot.task = null;
        if (cancelled || current !== generation) return;
        console.warn("Failed to render preview page", slot.number, error);
      }
    }

    /**
     * Re-fit every page to a new container width. Previously painted bitmaps are
     * dropped and repainted at the new resolution.
     * @param {number} width
     */
    function layout(width) {
      generation += 1;
      for (const slot of slots) {
        release(slot);
        slot.width = width;
        slot.div.style.width = `${width}px`;
        slot.div.style.height = `${Math.round(width * slot.ratio)}px`;
      }
    }

    (async () => {
      try {
        if (!storageFilename) return setStatus("failed");
        const blob = await StorageFiles.preview(storageFilename);
        if (cancelled) return;
        if (!blob) return setStatus("failed");
        const data = new Uint8Array(await blob.arrayBuffer());
        if (cancelled) return;

        // The published build is a UMD bundle, so the namespace shape depends on
        // how the bundler interops it - normalise to the module object either way.
        const loaded = await import("pdfjs-dist/legacy/build/pdf");
        if (cancelled) return;
        const pdfjs = loaded?.GlobalWorkerOptions ? loaded : loaded?.default;
        if (!pdfjs?.getDocument) return setStatus("failed");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

        loadingTask = pdfjs.getDocument({ data });
        pdf = await loadingTask.promise;
        if (cancelled) return;

        // Viewport-relative observation so lazily painted pages keep working
        // whether the preview scrolls itself or the modal around it does.
        if (typeof IntersectionObserver !== "undefined") {
          observer = new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                const slot = slotsByDiv.get(entry.target);
                if (!slot) continue;
                if (entry.isIntersecting) {
                  tick += 1;
                  slot.seen = tick;
                  onScreen.add(slot);
                  paint(slot);
                } else {
                  onScreen.delete(slot);
                }
              }
            },
            { root: null, rootMargin: PRELOAD_MARGIN }
          );
        }

        const width = pageWidth();
        for (let number = 1; number <= pdf.numPages; number += 1) {
          const page = await pdf.getPage(number);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const ratio = base.height / base.width;

          const div = document.createElement("div");
          div.className =
            "relative shrink-0 overflow-hidden rounded-sm bg-white shadow-sm";
          div.style.width = `${width}px`;
          div.style.height = `${Math.round(width * ratio)}px`;

          const canvas = document.createElement("canvas");
          canvas.className = "block h-full w-full bg-white";
          div.appendChild(canvas);
          host.appendChild(div);

          /** @type {PageSlot} */
          const slot = {
            number,
            div,
            canvas,
            width,
            ratio,
            task: null,
            rendered: false,
            seen: 0,
          };
          slots.push(slot);
          slotsByDiv.set(div, slot);
          if (observer) {
            observer.observe(div);
          } else {
            onScreen.add(slot);
            paint(slot);
          }
        }
        if (cancelled) return;

        setStatus("ready");

        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
              if (cancelled || !slots.length) return;
              const next = pageWidth();
              if (Math.abs(slots[0].width - next) < 1) return;
              layout(next);
              for (const slot of onScreen) paint(slot);
            }, RESIZE_DEBOUNCE);
          });
          resizeObserver.observe(host);
        }
      } catch (error) {
        if (cancelled) return;
        console.warn("Preview failed:", error);
        setStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
      generation += 1;
      clearTimeout(resizeTimer);
      observer?.disconnect();
      resizeObserver?.disconnect();
      for (const slot of slots) {
        if (!slot.task) continue;
        try {
          slot.task.cancel();
        } catch {
          /* render already finished */
        }
      }
      onScreen.clear();
      slotsByDiv.clear();
      host.replaceChildren();
      // Destroys the worker and frees the parsed document; pages must go first.
      loadingTask?.destroy().catch(() => {});
      loadingTask = null;
      pdf = null;
    };
  }, [storageFilename]);

  if (status === "failed") return <>{fallback}</>;

  return (
    <div className="relative w-full">
      <div
        ref={hostRef}
        className="flex flex-col items-center gap-y-2 md:gap-y-3 w-full min-h-[200px] md:max-h-[70vh] md:overflow-y-auto overscroll-contain rounded-lg border border-zinc-700 light:border-slate-200 bg-zinc-800/40 light:bg-slate-100 p-2 md:p-3"
      />
      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-y-3 text-zinc-400 light:text-slate-500">
          <CircleNotch size={24} weight="bold" className="animate-spin" />
          <span className="text-sm">{t("chatPreview.loading")}</span>
        </div>
      )}
    </div>
  );
}
