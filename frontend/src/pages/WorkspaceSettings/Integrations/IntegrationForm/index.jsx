import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal, {
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHint,
  ModalInput,
  ModalLabel,
  ModalPrimaryButton,
  ModalSecondaryButton,
} from "@/components/lib/Modal";
import WorkspaceIntegration from "@/models/workspaceIntegration";
import showToast from "@/utils/toast";

const DEFAULT_FORM = {
  provider: null,
  name: "",
  accountEmail: "",
  authUser: "",
  appPassword: "",
  imapHost: "",
  imapPort: "",
  smtpHost: "",
  smtpPort: "",
  caldavUrl: "",
  calendarPath: "",
  scopes: [],
  enabled: true,
};

function formFromIntegration(integration, providers) {
  if (!integration) return { ...DEFAULT_FORM };
  return {
    provider: integration.provider,
    name: integration.name || "",
    accountEmail: integration.account_email || "",
    authUser: integration.auth_user || "",
    appPassword: "",
    imapHost: integration.imap_host || "",
    imapPort: integration.imap_port ? String(integration.imap_port) : "",
    smtpHost: integration.smtp_host || "",
    smtpPort: integration.smtp_port ? String(integration.smtp_port) : "",
    caldavUrl: integration.caldav_url || "",
    calendarPath: integration.calendar_path || "",
    scopes: integration.scopes ?? [],
    enabled: integration.enabled !== false,
  };
}

/**
 * Create/edit form for one mail / calendar account. Kept intentionally linear:
 * provider → address + app password → what the agent may do. Advanced hosts
 * (custom IMAP endpoint for a corporate Yandex 360 domain, CalDAV path
 * override) live behind a disclosure so a first-time user is not distracted.
 */
export default function IntegrationForm({
  slug,
  integration,
  providers,
  labelForProvider,
  onClose,
  onSaved,
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState(() => formFromIntegration(integration, providers));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(
    () =>
      Boolean(
        integration?.imap_host &&
          providers.find((p) => p.id === integration.provider) &&
          integration.imap_host !== undefined
      )
  );

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === form.provider) ?? null,
    [providers, form.provider]
  );

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const toggleScope = (scope, checked) => {
    setField(
      "scopes",
      checked
        ? [...new Set([...(form.scopes || []), scope])]
        : (form.scopes || []).filter((s) => s !== scope)
    );
  };

  const guessProvider = (email) => {
    const domain = String(email).split("@")[1]?.toLowerCase() ?? "";
    return providers.find((p) => p.id === guessProviderId(domain)) ?? null;
  };
  const guessProviderId = (domain) => {
    for (const p of providers) {
      // Provider catalog on the backend exposes only ids; domain match happens
      // server-side and we mirror the two known families here for a snappy UI.
      if (p.id === "yandex" && /(^|\.)yandex\./.test(domain)) return p.id;
      if (p.id === "mail_ru" && /(^|\.)(mail\.ru|inbox\.ru|list\.ru|bk\.ru)$/.test(domain))
        return p.id;
    }
    return null;
  };

  const onEmailChange = (value) => {
    setField("accountEmail", value);
    if (!form.authUser || form.authUser === form.accountEmail)
      setField("authUser", value);
    if (!form.provider && value.includes("@")) {
      const guessed = guessProvider(value);
      if (guessed) {
        setField("provider", guessed.id);
        setField("scopes", guessed.capabilities ?? []);
      }
    }
  };

  const onProviderChange = (id) => {
    const provider = providers.find((p) => p.id === id);
    setForm((prev) => ({
      ...prev,
      provider: id,
      // When the provider changes, keep only scopes the new provider supports.
      scopes: (prev.scopes ?? []).filter((s) =>
        provider?.capabilities?.includes(s)
      ),
    }));
  };

  const canSubmit =
    form.provider &&
    form.name.trim() &&
    form.accountEmail.trim() &&
    form.scopes.length > 0 &&
    (integration ? true : form.appPassword.trim().length > 0);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!canSubmit) {
      showToast(t("workspaceIntegrations.incomplete"), "error", { clear: true });
      return;
    }
    setSaving(true);
    const payload = {
      provider: form.provider,
      name: form.name.trim(),
      accountEmail: form.accountEmail.trim(),
      authUser: form.authUser.trim() || form.accountEmail.trim(),
      imapHost: form.imapHost.trim() || undefined,
      imapPort: form.imapPort ? Number(form.imapPort) : undefined,
      smtpHost: form.smtpHost.trim() || undefined,
      smtpPort: form.smtpPort ? Number(form.smtpPort) : undefined,
      caldavUrl: form.caldavUrl.trim() || undefined,
      calendarPath: form.calendarPath.trim() || undefined,
      scopes: form.scopes,
      enabled: form.enabled,
    };
    if (form.appPassword.trim()) payload.appPassword = form.appPassword.trim();

    const res = integration
      ? await WorkspaceIntegration.update(slug, integration.id, payload)
      : await WorkspaceIntegration.create(slug, payload);

    setSaving(false);
    if (res?.error) {
      showToast(res.error, "error", { clear: true });
      return;
    }
    showToast(t("workspaceIntegrations.saved"), "success");
    await onSaved();
    onClose();
  };

  const handleTest = async () => {
    if (!integration) {
      showToast(t("workspaceIntegrations.testNeedsSaved"), "warning", {
        clear: true,
      });
      return;
    }
    setTesting(true);
    const res = await WorkspaceIntegration.test(slug, integration.id, {
      appPassword: form.appPassword.trim() || null,
    });
    setTesting(false);
    if (res.success) showToast(t("workspaceIntegrations.testOk"), "success");
    else
      showToast(
        `${t("workspaceIntegrations.testFailed")}: ${res.error ?? ""}`,
        "error",
        { clear: true }
      );
  };

  return (
    <Modal isOpen={true} onClose={onClose} size="lg" closeOnEsc={false}>
      <ModalHeader
        title={
          integration
            ? t("workspaceIntegrations.editTitle")
            : t("workspaceIntegrations.addTitle")
        }
        onClose={onClose}
      />
      <ModalBody>
        <form onSubmit={handleSubmit} className="flex flex-col gap-y-4">
          <ModalLabel>
            {t("workspaceIntegrations.providerLabel")}
          </ModalLabel>
          <div className="grid grid-cols-2 gap-2">
            {providers.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => onProviderChange(p.id)}
                className={`px-3 py-2 rounded-lg border text-sm text-left transition-colors duration-200 ${
                  form.provider === p.id
                    ? "border-sky-400 bg-sky-500/10 text-white light:text-slate-900"
                    : "border-white/10 light:border-slate-300 text-white/70 light:text-slate-600 hover:border-white/30 light:hover:border-slate-400"
                }`}
              >
                <div className="font-medium">{labelForProvider(p)}</div>
                <div className="text-[11px] opacity-70">
                  {p.hasCalendar
                    ? t("workspaceIntegrations.providerHasBoth")
                    : t("workspaceIntegrations.providerHasEmailOnly")}
                </div>
              </button>
            ))}
          </div>

          <ModalLabel>{t("workspaceIntegrations.nameLabel")}</ModalLabel>
          <ModalInput
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder={t("workspaceIntegrations.namePlaceholder")}
          />

          <ModalLabel>{t("workspaceIntegrations.emailLabel")}</ModalLabel>
          <ModalInput
            type="email"
            value={form.accountEmail}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="name@yandex.ru"
          />
          <ModalHint>{t("workspaceIntegrations.emailHint")}</ModalHint>

          <ModalLabel optional>
            {t("workspaceIntegrations.authUserLabel")}
          </ModalLabel>
          <ModalInput
            value={form.authUser}
            onChange={(e) => setField("authUser", e.target.value)}
            placeholder={form.accountEmail || "name@yandex.ru"}
          />

          <ModalLabel>
            {integration
              ? t("workspaceIntegrations.appPasswordLabelExisting")
              : t("workspaceIntegrations.appPasswordLabel")}
          </ModalLabel>
          <ModalInput
            type="password"
            value={form.appPassword}
            onChange={(e) => setField("appPassword", e.target.value)}
            placeholder={
              integration
                ? t("workspaceIntegrations.appPasswordKeepEmpty")
                : "••••••••••••"
            }
            autoComplete="new-password"
          />
          {selectedProvider?.passwordHelpUrlEn && (
            <ModalHint>
              <a
                href={
                  t("workspaceIntegrations.appPasswordHelpLink", {
                    defaultValue: selectedProvider.passwordHelpUrlEn,
                  }) || selectedProvider.passwordHelpUrlEn
                }
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:underline"
              >
                {t("workspaceIntegrations.appPasswordHelp")}
              </a>
            </ModalHint>
          )}

          <ModalLabel>{t("workspaceIntegrations.scopesLabel")}</ModalLabel>
          <div className="flex flex-col gap-y-2">
            {(selectedProvider?.capabilities ?? []).map((scope) => {
              const checked = form.scopes.includes(scope);
              return (
                <label
                  key={scope}
                  className="flex items-start gap-x-3 rounded-lg border border-white/10 light:border-slate-300 p-3 cursor-pointer hover:border-white/20 light:hover:border-slate-400 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggleScope(scope, e.target.checked)}
                    className="mt-1 accent-sky-500"
                  />
                  <div className="flex flex-col">
                    <span className="text-sm text-white light:text-slate-900 font-medium">
                      {t(`workspaceIntegrations.scopeLabels.${scope}`, scope)}
                    </span>
                    <span className="text-xs text-white/50 light:text-slate-500">
                      {t(
                        `workspaceIntegrations.scopeDescriptions.${scope}`,
                        ""
                      )}
                    </span>
                  </div>
                </label>
              );
            })}
            {!selectedProvider && (
              <p className="text-xs text-white/40 light:text-slate-500">
                {t("workspaceIntegrations.pickProviderFirst")}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs text-white/50 light:text-slate-500 hover:text-white light:hover:text-slate-900 text-left"
          >
            {showAdvanced
              ? t("workspaceIntegrations.hideAdvanced")
              : t("workspaceIntegrations.showAdvanced")}
          </button>
          {showAdvanced && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <ModalLabel optional>
                {t("workspaceIntegrations.imapHostLabel")}
              </ModalLabel>
              <ModalInput
                value={form.imapHost}
                onChange={(e) => setField("imapHost", e.target.value)}
                placeholder="imap.yandex.ru"
              />
              <ModalLabel optional>
                {t("workspaceIntegrations.imapPortLabel")}
              </ModalLabel>
              <ModalInput
                value={form.imapPort}
                onChange={(e) => setField("imapPort", e.target.value)}
                placeholder="993"
              />
              <ModalLabel optional>
                {t("workspaceIntegrations.smtpHostLabel")}
              </ModalLabel>
              <ModalInput
                value={form.smtpHost}
                onChange={(e) => setField("smtpHost", e.target.value)}
                placeholder="smtp.yandex.ru"
              />
              <ModalLabel optional>
                {t("workspaceIntegrations.smtpPortLabel")}
              </ModalLabel>
              <ModalInput
                value={form.smtpPort}
                onChange={(e) => setField("smtpPort", e.target.value)}
                placeholder="465"
              />
              <ModalLabel optional>
                {t("workspaceIntegrations.caldavUrlLabel")}
              </ModalLabel>
              <ModalInput
                value={form.caldavUrl}
                onChange={(e) => setField("caldavUrl", e.target.value)}
                placeholder="https://realbox.me/dav/"
              />
              <ModalLabel optional>
                {t("workspaceIntegrations.calendarPathLabel")}
              </ModalLabel>
              <ModalInput
                value={form.calendarPath}
                onChange={(e) => setField("calendarPath", e.target.value)}
                placeholder="(leave empty to auto-pick)"
              />
            </div>
          )}
        </form>
      </ModalBody>
      <ModalFooter>
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !integration}
            className="text-sm text-white/60 light:text-slate-600 hover:text-white light:hover:text-slate-900 disabled:opacity-40"
          >
            {testing
              ? t("workspaceIntegrations.testing")
              : t("workspaceIntegrations.test")}
          </button>
          <div className="flex items-center gap-x-2">
            <ModalSecondaryButton type="button" onClick={onClose}>
              {t("workspaceIntegrations.cancel")}
            </ModalSecondaryButton>
            <ModalPrimaryButton
              type="button"
              onClick={handleSubmit}
              disabled={saving || !canSubmit}
            >
              {saving
                ? t("workspaceIntegrations.saving")
                : t("workspaceIntegrations.save")}
            </ModalPrimaryButton>
          </div>
        </div>
      </ModalFooter>
    </Modal>
  );
}
