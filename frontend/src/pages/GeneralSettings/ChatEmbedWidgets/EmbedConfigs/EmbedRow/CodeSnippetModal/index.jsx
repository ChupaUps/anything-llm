import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle, CopySimple } from "@phosphor-icons/react";
import showToast from "@/utils/toast";
import hljs from "highlight.js";
import System from "@/models/system";
import "@/utils/chat/themes/github-dark.css";
import "@/utils/chat/themes/github.css";
import {
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalSecondaryButton,
  ModalLabel,
  ModalHint,
} from "@/components/lib/Modal";

function getHosts() {
  const scriptHost = import.meta.env.DEV
    ? "http://localhost:3000"
    : window.location.origin;
  const serverHost = import.meta.env.DEV
    ? "http://localhost:3001"
    : window.location.origin;
  return { scriptHost, serverHost };
}

// The widget ships only these two locales and reads its language from the
// script tag, so the embed code is generated in the language the admin is
// currently using in this UI.
function widgetLanguage(i18nLanguage) {
  return String(i18nLanguage || "")
    .toLowerCase()
    .startsWith("en")
    ? "en"
    : "ru";
}

// Snippet values are interpolated into HTML attributes, so quotes and angle
// brackets coming from a custom app name must not be able to break the tag.
function escapeAttr(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Branding that the embed widget should render. `/system/logo` is a public
 * endpoint that always resolves to the current instance logo (the uploaded
 * custom one when set), so replacing the logo needs no rebuild of this code.
 * `theme=light` selects the dark logo variant because the widget chrome is
 * white - the same variant the main app uses on light surfaces.
 * The avatar next to model replies is only emitted once an admin uploads one
 * under Settings -> Branding, otherwise the widget keeps its built-in icon.
 */
function useBranding(serverHost) {
  const [appName, setAppName] = useState("");
  const [assistantIconUrl, setAssistantIconUrl] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function fetchBranding() {
      const [{ appName: name }, hasIcon] = await Promise.all([
        System.fetchCustomAppName(),
        System.hasAssistantIcon(),
      ]);
      if (cancelled) return;
      setAppName(name || "");
      setAssistantIconUrl(
        hasIcon ? `${serverHost}/api/system/assistant-icon` : ""
      );
    }
    fetchBranding();
    return () => {
      cancelled = true;
    };
  }, []);
  return {
    appName,
    logoUrl: `${serverHost}/api/system/logo?theme=light`,
    assistantIconUrl,
  };
}

function createScriptTagSnippet(embed, scriptHost, serverHost, opts = {}) {
  const {
    language,
    appName,
    logoUrl,
    assistantIconUrl,
    brandName,
    comment,
    greeting,
  } = opts;
  const name = escapeAttr(appName || brandName);
  return `<!--
${comment}
-->
<script
  data-embed-id="${embed.uuid}"
  data-base-api-url="${serverHost}/api/embed"
  data-language="${language}"
  data-brand-image-url="${logoUrl}"
  data-assistant-name="${name}"${greeting ? `\n  data-greeting="${escapeAttr(greeting)}"` : ""}${assistantIconUrl ? `\n  data-assistant-icon="${assistantIconUrl}"` : ""}
  data-show-thoughts="true"
  src="${scriptHost}/embed/anythingllm-chat-widget.min.js">
</script>
<!-- ${name} (${brandName}) -->
`;
}

// The inline page renders the chat so it fills its frame edge to edge, therefore
// the iframe itself must not add a border, a card radius or the few pixels of
// gap a bare inline element leaves under it.
function createInlineIframeSnippet(embed, serverHost, height, opts = {}) {
  const { language, appName, brandName, comment } = opts;
  const name = escapeAttr(appName || brandName);
  return `<!--
${comment}
-->
<iframe
  src="${serverHost}/api/embed/${embed.uuid}/inline?lang=${language}"
  width="100%"
  height="${height}"
  style="border:none;display:block;width:100%;height:${height}px;"
  loading="lazy"
  title="${name}">
</iframe>
`;
}

// ── Reusable copy-to-clipboard code block ──────────────────────────────────
function CopyBlock({ snippet, theme }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleClick = () => {
    window.navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    showToast(t("embeddable.code.copiedToast"), "success", { clear: true });
  };

  return (
    <button
      disabled={copied}
      onClick={handleClick}
      title={t("embeddable.code.copy")}
      className={`border-none disabled:border disabled:border-green-300 disabled:light:border-green-600 border border-transparent relative w-full font-mono flex hljs ${theme} light:border light:border-gray-700 text-white placeholder:text-zinc-400 text-sm rounded-lg focus:border-sky-500 light:focus:border-sky-500 outline-none p-3`}
    >
      <div
        className="flex w-full text-left flex-col gap-y-1 pr-6 whitespace-pre-line"
        dangerouslySetInnerHTML={{
          __html: hljs.highlight(snippet, {
            language: "html",
            ignoreIllegals: true,
          }).value,
        }}
      />
      {copied ? (
        <CheckCircle
          size={14}
          className="text-green-300 light:text-green-600 absolute top-2 right-2"
        />
      ) : (
        <CopySimple size={14} className="absolute top-2 right-2" />
      )}
    </button>
  );
}

// ── Popup tab content ───────────────────────────────────────────────────────
function PopupTab({ embed, theme }) {
  const { t, i18n } = useTranslation();
  const { scriptHost, serverHost } = getHosts();
  const { appName, logoUrl, assistantIconUrl } = useBranding(serverHost);
  const sponsorUrl = t("embeddable.code.sponsorUrl");
  const snippet = createScriptTagSnippet(embed, scriptHost, serverHost, {
    language: widgetLanguage(i18n.language),
    appName,
    logoUrl,
    assistantIconUrl,
    brandName: sponsorUrl,
    comment: t("embeddable.code.popupComment"),
    greeting: t("embeddable.code.greeting"),
  });

  return (
    <div className="flex flex-col gap-y-3">
      <div className="flex flex-col gap-y-1">
        <ModalLabel>{t("embeddable.code.popupLabel")}</ModalLabel>
        <ModalHint>{t("embeddable.code.popupHint")}</ModalHint>
        <a
          href="https://www.interstorm.ru/interstormllm"
          target="_blank"
          rel="noreferrer"
          className="text-blue-300 light:text-blue-500 hover:underline text-xs"
        >
          {t("embeddable.code.popupDocsLink")} &rarr;
        </a>
      </div>
      <CopyBlock snippet={snippet} theme={theme} />
    </div>
  );
}

// ── Inline tab content ──────────────────────────────────────────────────────
function InlineTab({ embed, theme }) {
  const { t, i18n } = useTranslation();
  const { serverHost } = getHosts();
  const { appName } = useBranding(serverHost);
  const [height, setHeight] = useState(600);
  const sponsorUrl = t("embeddable.code.sponsorUrl");
  const language = widgetLanguage(i18n.language);
  const snippet = createInlineIframeSnippet(embed, serverHost, height, {
    language,
    appName,
    brandName: sponsorUrl,
    comment: t("embeddable.code.inlineComment"),
  });

  return (
    <div className="flex flex-col gap-y-3">
      <div className="flex flex-col gap-y-1">
        <ModalLabel>{t("embeddable.code.inlineLabel")}</ModalLabel>
        <ModalHint>{t("embeddable.code.inlineHint")}</ModalHint>
      </div>

      {/* Height control */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-zinc-400 light:text-slate-500 whitespace-nowrap">
          {t("embeddable.code.inlineHeight")}
        </label>
        <input
          type="range"
          min={300}
          max={900}
          step={50}
          value={height}
          onChange={(e) => setHeight(Number(e.target.value))}
          className="flex-1 accent-sky-500"
        />
        <span className="text-xs text-zinc-300 light:text-slate-700 w-12 text-right">
          {height}px
        </span>
      </div>

      <CopyBlock snippet={snippet} theme={theme} />

      {/* Live preview */}
      <div className="mt-2">
        <ModalHint>{t("embeddable.code.inlinePreview")}</ModalHint>
        <div
          className="mt-2 rounded-xl overflow-hidden border border-zinc-700 light:border-slate-300"
          style={{ height: Math.min(height, 360) }}
        >
          <iframe
            src={`${serverHost}/api/embed/${embed.uuid}/inline?lang=${language}`}
            width="100%"
            height="100%"
            style={{ border: "none", display: "block" }}
            title={t("embeddable.code.previewTitle")}
            loading="lazy"
          />
        </div>
      </div>
    </div>
  );
}

// ── Tab bar ─────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 mb-4 bg-zinc-800 light:bg-slate-200 rounded-lg p-1 w-fit">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
            active === tab.id
              ? "bg-sky-500 text-white"
              : "text-zinc-400 light:text-slate-600 hover:text-white light:hover:text-slate-900"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ── Main modal ──────────────────────────────────────────────────────────────
export default function CodeSnippetModal({ embed, closeModal }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("popup");
  const theme =
    window.localStorage.getItem("theme") === "light" ? "github" : "github-dark";
  const tabs = [
    { id: "popup", label: t("embeddable.code.tabPopup") },
    { id: "inline", label: t("embeddable.code.tabInline") },
  ];

  return (
    <div className="flex flex-col gap-y-5">
      <ModalHeader title={t("embeddable.code.title")} onClose={closeModal} />
      <ModalBody className="max-h-[75vh] overflow-y-auto">
        <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />
        {activeTab === "popup" ? (
          <PopupTab embed={embed} theme={theme} />
        ) : (
          <InlineTab embed={embed} theme={theme} />
        )}
      </ModalBody>
      <ModalFooter className="justify-end">
        <ModalSecondaryButton onClick={closeModal} type="button">
          {t("embeddable.code.close")}
        </ModalSecondaryButton>
      </ModalFooter>
    </div>
  );
}
