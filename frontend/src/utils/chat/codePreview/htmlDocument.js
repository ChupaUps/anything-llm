import {
  buildDocument,
  buildPreviewHead,
  injectIntoDocument,
  isFullDocument,
} from "./documentTemplate";

/**
 * Builds the srcdoc document for an HTML block. Fragments are wrapped into a
 * minimal document with base styles; complete documents are preserved and our
 * runtime is injected into their <head>.
 * @param {string} id - preview id used for height reporting
 * @param {string} source - the raw code block contents
 * @returns {string}
 */
export function buildHtmlPreviewDocument(id, source) {
  const fullDocument = isFullDocument(source);
  const head = buildPreviewHead(id, { includeBaseStyles: !fullDocument });

  if (!fullDocument)
    return buildDocument({ head, body: source, title: "HTML preview" });

  return injectIntoDocument(source, { headHtml: head });
}
