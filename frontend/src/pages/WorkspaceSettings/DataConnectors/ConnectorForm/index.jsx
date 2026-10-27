import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal, {
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalInput,
  ModalTextarea,
  ModalLabel,
  ModalHint,
  ModalPrimaryButton,
  ModalSecondaryButton,
} from "@/components/lib/Modal";
import WorkspaceDataConnector from "@/models/workspaceDataConnector";
import showToast from "@/utils/toast";
import { CheckCircle, XCircle } from "@phosphor-icons/react";

const AUTH_TYPES = ["none", "bearer", "basic", "header", "query"];
const PROVIDERS = ["1c", "bitrix24", "generic"];
// Providers where the address is a base and the endpoint is stored separately.
const PATH_PROVIDERS = ["bitrix24", "generic"];
// Bitrix24 grants access either through an inbound webhook (the token lives in
// the address) or through an OAuth application token sent as `auth`.
const VARIANTS = { bitrix24: ["webhook", "oauth"] };

const DEFAULT_FORM = {
  name: "",
  description: "",
  provider: "generic",
  variant: null,
  url: "",
  defaultPath: "",
  authType: "bearer",
  authUsername: "",
  authSecret: "",
  authKey: "",
  headers: "",
  responseSchema: "",
  enabled: true,
};

/** Auth strategy most tools of a given system use out of the box. */
const PROVIDER_DEFAULTS = {
  "1c": { authType: "basic" },
  bitrix24: { authType: "none" },
  generic: { authType: "bearer" },
};

function formFromConnector(connector = null) {
  if (!connector) return { ...DEFAULT_FORM };
  return {
    name: connector.name || "",
    description: connector.description || "",
    provider: PROVIDERS.includes(connector.provider)
      ? connector.provider
      : "generic",
    variant: connector.variant || null,
    url: connector.url || "",
    defaultPath: connector.default_path || "",
    authType: AUTH_TYPES.includes(connector.auth_type)
      ? connector.auth_type
      : "none",
    authUsername: connector.auth_username || "",
    authSecret: "",
    authKey: connector.auth_key || "",
    headers: connector.headers || "",
    responseSchema: connector.response_schema || "",
    enabled: connector.enabled !== false,
  };
}

/**
 * Create/edit form for one external system. "Test" performs a real GET so the
 * user can verify the key/address and let the server generate a JSON schema of
 * the response before saving.
 */
export default function ConnectorForm({ slug, connector, onClose, onSaved }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(() => formFromConnector(connector));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const isEdit = !!connector?.id;
  const canSave = useMemo(
    () => form.name.trim().length > 0 && form.url.trim().length > 0 && !saving,
    [form.name, form.url, saving]
  );

  // New connections are named after the chosen system, so two Bitrix24 variants
  // and a 1C connection can coexist in the same workspace.
  const presetNames = useMemo(
    () => ({
      "1c": t("dataConnector.namePreset_1c"),
      "bitrix24:webhook": t("dataConnector.namePreset_bitrix24_webhook"),
      "bitrix24:oauth": t("dataConnector.namePreset_bitrix24_oauth"),
      generic: t("dataConnector.namePreset_generic"),
    }),
    [t]
  );

  const presetKey = (provider, variant) =>
    VARIANTS[provider]
      ? `${provider}:${variant ?? VARIANTS[provider][0]}`
      : provider;

  const nameFor = (current, provider, variant) => {
    const trimmed = String(current.name || "").trim();
    const untouched = !trimmed || Object.values(presetNames).includes(trimmed);
    return untouched ? presetNames[presetKey(provider, variant)] : current.name;
  };

  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  const changeProvider = (provider) => {
    setForm((current) => {
      const variant = VARIANTS[provider]?.includes(current.variant)
        ? current.variant
        : (VARIANTS[provider]?.[0] ?? null);
      return {
        ...current,
        provider,
        variant,
        authType: PROVIDER_DEFAULTS[provider]?.authType || current.authType,
        name: nameFor(current, provider, variant),
      };
    });
  };

  const changeVariant = (variant) => {
    setForm((current) => ({
      ...current,
      variant,
      name: nameFor(current, current.provider, variant),
    }));
  };

  const isBitrix = form.provider === "bitrix24";
  const allowsPath = PATH_PROVIDERS.includes(form.provider);
  const variant = isBitrix ? (form.variant ?? "webhook") : null;
  const urlPlaceholder = isBitrix
    ? t(`dataConnector.urlPlaceholder_bitrix24_${variant}`)
    : t(`dataConnector.urlPlaceholder_${form.provider}`);
  const urlHint = isBitrix
    ? t(`dataConnector.urlHint_bitrix24_${variant}`)
    : t(`dataConnector.urlHint_${form.provider}`);

  const payload = () => ({
    name: form.name.trim(),
    description: form.description.trim(),
    provider: form.provider,
    variant,
    url: form.url.trim(),
    defaultPath: allowsPath ? form.defaultPath.trim() : null,
    authType: isBitrix ? "none" : form.authType,
    authUsername: form.authUsername.trim(),
    // An empty field means "keep the stored secret" - the server never sends
    // the current value back to the browser.
    ...(form.authSecret ? { authSecret: form.authSecret } : {}),
    authKey: form.authKey.trim(),
    headers: form.headers.trim() ? form.headers.trim() : null,
    responseSchema: form.responseSchema.trim()
      ? form.responseSchema.trim()
      : null,
    enabled: form.enabled,
  });

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await WorkspaceDataConnector.testDraft(slug, {
      ...payload(),
      connectorId: connector?.id ?? null,
    });
    setTesting(false);
    setTestResult(result);

    // Auto-generated schema is a starting point - the user can still edit it.
    if (result?.success && result.schema)
      update("responseSchema", result.schema);
  };

  const handleSave = async () => {
    setSaving(true);
    const { connector: saved, error } = isEdit
      ? await WorkspaceDataConnector.update(slug, connector.id, payload())
      : await WorkspaceDataConnector.create(slug, payload());
    setSaving(false);

    if (!saved) {
      showToast(error || t("dataConnector.saveError"), "error", {
        clear: true,
      });
      return;
    }

    showToast(t("dataConnector.saved"), "success");
    onSaved?.();
    onClose?.();
  };

  return (
    <Modal isOpen={true} onClose={onClose} size="lg">
      <ModalHeader
        title={
          isEdit ? t("dataConnector.editTitle") : t("dataConnector.addTitle")
        }
        subtitle={t("dataConnector.formSubtitle")}
        onClose={onClose}
      />
      <ModalBody className="max-h-[58vh] overflow-y-auto pr-1">
        <ModalInput
          label={t("dataConnector.name")}
          name="connector-name"
          value={form.name}
          placeholder={t("dataConnector.namePlaceholder")}
          onChange={(e) => update("name", e.target.value)}
        />

        <ModalInput
          label={t("dataConnector.descriptionLabel")}
          name="connector-description"
          optional
          value={form.description}
          placeholder={t("dataConnector.descriptionPlaceholder")}
          onChange={(e) => update("description", e.target.value)}
          hint={t("dataConnector.descriptionHint")}
        />

        <div className="flex flex-col gap-y-1.5">
          <ModalLabel>{t("dataConnector.provider")}</ModalLabel>
          <div className="flex gap-x-2 flex-wrap">
            {PROVIDERS.map((provider) => (
              <button
                key={provider}
                type="button"
                onClick={() => changeProvider(provider)}
                className={`h-[34px] px-3 rounded-lg text-sm font-medium border transition-colors duration-200 ${
                  form.provider === provider
                    ? "border-sky-500 text-sky-400 bg-sky-500/10"
                    : "border-zinc-700 light:border-slate-300 text-zinc-300 light:text-slate-600 hover:border-zinc-500"
                }`}
              >
                {t(`dataConnector.provider_${provider}`)}
              </button>
            ))}
          </div>
        </div>

        {isBitrix && (
          <div className="flex flex-col gap-y-1.5">
            <ModalLabel>{t("dataConnector.variant")}</ModalLabel>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-2 gap-y-2">
              {VARIANTS.bitrix24.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => changeVariant(option)}
                  className={`flex flex-col items-start gap-y-1 rounded-lg border px-3 py-2 text-left transition-colors duration-200 ${
                    variant === option
                      ? "border-sky-500 bg-sky-500/10"
                      : "border-zinc-700 light:border-slate-300 hover:border-zinc-500"
                  }`}
                >
                  <span
                    className={`text-sm font-medium ${
                      variant === option
                        ? "text-sky-400"
                        : "text-zinc-300 light:text-slate-600"
                    }`}
                  >
                    {t(`dataConnector.variant_bitrix24_${option}`)}
                  </span>
                  <span className="text-xs text-white/50 light:text-slate-500">
                    {t(`dataConnector.variantHint_bitrix24_${option}`)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <ModalInput
          label={t("dataConnector.url")}
          name="connector-url"
          value={form.url}
          placeholder={urlPlaceholder}
          onChange={(e) => update("url", e.target.value)}
          hint={urlHint}
        />

        {allowsPath && (
          <ModalInput
            label={
              isBitrix
                ? t("dataConnector.defaultPath")
                : t("dataConnector.defaultPath_generic")
            }
            name="connector-default-path"
            optional
            value={form.defaultPath}
            placeholder={
              isBitrix
                ? t("dataConnector.defaultPathPlaceholder")
                : t("dataConnector.defaultPathPlaceholder_generic")
            }
            onChange={(e) => update("defaultPath", e.target.value)}
            hint={
              isBitrix
                ? t("dataConnector.defaultPathHint")
                : t("dataConnector.defaultPathHint_generic")
            }
          />
        )}

        {isBitrix ? (
          variant === "oauth" ? (
            <ModalInput
              label={t("dataConnector.token")}
              name="connector-secret"
              type="password"
              value={form.authSecret}
              placeholder={
                connector?.hasSecret
                  ? t("dataConnector.secretKeep")
                  : t("dataConnector.token")
              }
              onChange={(e) => update("authSecret", e.target.value)}
              hint={
                connector?.hasSecret
                  ? t("dataConnector.secretKeepHint")
                  : t("dataConnector.tokenHint")
              }
            />
          ) : (
            <ModalHint>{t("dataConnector.webhookNoToken")}</ModalHint>
          )
        ) : (
          <>
            <div className="flex flex-col gap-y-1.5">
              <ModalLabel>{t("dataConnector.auth")}</ModalLabel>
              <select
                value={form.authType}
                onChange={(e) => update("authType", e.target.value)}
                className="w-full h-[34px] px-3 text-sm rounded-lg outline-none bg-zinc-800 border border-zinc-800 text-zinc-100 light:bg-white light:border-slate-300 light:text-slate-900 focus:border-sky-500"
              >
                {AUTH_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`dataConnector.auth_${type}`)}
                  </option>
                ))}
              </select>
            </div>

            {form.authType === "basic" && (
              <ModalInput
                label={t("dataConnector.authUsername")}
                name="connector-username"
                value={form.authUsername}
                onChange={(e) => update("authUsername", e.target.value)}
              />
            )}

            {["header", "query"].includes(form.authType) && (
              <ModalInput
                label={
                  form.authType === "header"
                    ? t("dataConnector.authKeyHeader")
                    : t("dataConnector.authKeyQuery")
                }
                name="connector-key-name"
                value={form.authKey}
                placeholder={
                  form.authType === "header" ? "X-API-Key" : "apikey"
                }
                onChange={(e) => update("authKey", e.target.value)}
              />
            )}

            {form.authType !== "none" && (
              <ModalInput
                label={
                  form.authType === "basic"
                    ? t("dataConnector.authPassword")
                    : t("dataConnector.authSecret")
                }
                name="connector-secret"
                type="password"
                value={form.authSecret}
                placeholder={
                  connector?.hasSecret
                    ? t("dataConnector.secretKeep")
                    : t("dataConnector.authSecret")
                }
                onChange={(e) => update("authSecret", e.target.value)}
                hint={
                  connector?.hasSecret ? t("dataConnector.secretKeepHint") : ""
                }
              />
            )}
          </>
        )}

        <ModalTextarea
          label={t("dataConnector.headers")}
          name="connector-headers"
          optional
          rows={2}
          value={form.headers}
          placeholder={'{"X-Org": "main"}'}
          onChange={(e) => update("headers", e.target.value)}
          hint={t("dataConnector.headersHint")}
        />

        <div className="flex items-center justify-between gap-x-3">
          <div className="flex flex-col gap-y-1">
            <ModalLabel>{t("dataConnector.schema")}</ModalLabel>
            <ModalHint>{t("dataConnector.schemaHint")}</ModalHint>
          </div>
          <ModalSecondaryButton
            type="button"
            onClick={handleTest}
            disabled={testing || !form.url.trim()}
          >
            {testing ? t("dataConnector.testing") : t("dataConnector.test")}
          </ModalSecondaryButton>
        </div>

        {testResult && <TestResult result={testResult} />}

        <ModalTextarea
          name="connector-schema"
          rows={6}
          value={form.responseSchema}
          onChange={(e) => update("responseSchema", e.target.value)}
          placeholder={t("dataConnector.schemaPlaceholder")}
        />
      </ModalBody>
      <ModalFooter>
        <ModalSecondaryButton type="button" onClick={onClose}>
          {t("dataConnector.cancel")}
        </ModalSecondaryButton>
        <ModalPrimaryButton
          type="button"
          onClick={handleSave}
          disabled={!canSave}
        >
          {saving ? t("dataConnector.saving") : t("dataConnector.save")}
        </ModalPrimaryButton>
      </ModalFooter>
    </Modal>
  );
}

function TestResult({ result }) {
  const { t } = useTranslation();
  const ok = Boolean(result.success);
  // The OAuth token travels in the query string, so it is masked before the
  // resolved address is shown to the user.
  const shownUrl = String(result.url || "").replace(
    /([?&]auth=)[^&]*/i,
    "$1***"
  );
  return (
    <div
      className={`rounded-lg border p-3 flex flex-col gap-y-2 ${
        ok
          ? "border-emerald-600/40 bg-emerald-500/10"
          : "border-red-600/40 bg-red-500/10"
      }`}
    >
      <div className="flex items-center gap-x-2 text-sm font-medium">
        {ok ? (
          <CheckCircle size={16} weight="fill" className="text-emerald-500" />
        ) : (
          <XCircle size={16} weight="fill" className="text-red-500" />
        )}
        <span className={ok ? "text-emerald-400" : "text-red-400"}>
          {ok ? t("dataConnector.testOk") : t("dataConnector.testFailed")}
        </span>
        <span className="text-xs text-zinc-400">
          {result.status ? `HTTP ${result.status}` : ""}
          {result.durationMs ? ` · ${result.durationMs} ms` : ""}
        </span>
      </div>
      {result.error && (
        <p className="text-xs text-red-300 break-words">{result.error}</p>
      )}
      {shownUrl && (
        <p className="text-xs text-zinc-400 break-all font-mono">{shownUrl}</p>
      )}
      {result.sample && (
        <pre className="text-xs text-zinc-300 light:text-slate-700 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
          {result.sample}
        </pre>
      )}
      {ok && (
        <p className="text-xs text-zinc-400">
          {t("dataConnector.schemaGenerated")}
        </p>
      )}
    </div>
  );
}
