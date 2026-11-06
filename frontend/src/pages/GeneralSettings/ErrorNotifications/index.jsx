import { useEffect, useState } from "react";
import { isMobile } from "react-device-detect";
import Sidebar from "@/components/SettingsSidebar";
import PreLoader from "@/components/Preloader";
import showToast from "@/utils/toast";
import Toggle from "@/components/lib/Toggle";
import ErrorNotifications from "@/models/errorNotifications";
import { useTranslation } from "react-i18next";

const INPUT_CLASS =
  "border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full py-2 px-4 light:text-black";

const DEFAULT_CONFIG = {
  enabled: false,
  serverName: "",
  minIntervalSec: 60,
  email: {
    enabled: false,
    smtpHost: "",
    smtpPort: 587,
    secure: false,
    authUser: "",
    authPass: "",
    from: "",
    to: "",
    hasAuthPass: false,
  },
  telegram: {
    enabled: false,
    botToken: "",
    chatId: "",
    hasBotToken: false,
  },
  capture: {
    processCrashes: true,
    http500: true,
    agentErrors: true,
    exitOnFatal: false,
  },
};

function Section({ title, description, children }) {
  return (
    <div className="flex flex-col gap-y-3 my-2 border-t border-white/10 light:border-black/10 pt-5">
      <div>
        <p className="text-sm leading-6 font-semibold text-theme-text-primary">
          {title}
        </p>
        {description && (
          <p className="text-xs text-theme-text-secondary">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-y-1.5 w-full max-w-[520px]">
      <label className="text-xs font-medium text-theme-text-secondary">
        {label}
      </label>
      {children}
    </div>
  );
}

export default function ErrorNotificationsSettings() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CONFIG);

  useEffect(() => {
    async function fetchConfig() {
      const { success, config: fetched } = await ErrorNotifications.getConfig();
      if (success && fetched) {
        setConfig({
          ...DEFAULT_CONFIG,
          ...fetched,
          email: { ...DEFAULT_CONFIG.email, ...(fetched.email || {}) },
          telegram: {
            ...DEFAULT_CONFIG.telegram,
            ...(fetched.telegram || {}),
          },
          capture: { ...DEFAULT_CONFIG.capture, ...(fetched.capture || {}) },
        });
      }
      setLoading(false);
    }
    fetchConfig();
  }, []);

  const patch = (updates) => {
    setConfig((prev) => ({ ...prev, ...updates }));
    setHasChanges(true);
  };
  const patchEmail = (updates) => {
    setConfig((prev) => ({ ...prev, email: { ...prev.email, ...updates } }));
    setHasChanges(true);
  };
  const patchTelegram = (updates) => {
    setConfig((prev) => ({
      ...prev,
      telegram: { ...prev.telegram, ...updates },
    }));
    setHasChanges(true);
  };
  const patchCapture = (updates) => {
    setConfig((prev) => ({
      ...prev,
      capture: { ...prev.capture, ...updates },
    }));
    setHasChanges(true);
  };

  async function buildPayload() {
    // Only save first so the server has the latest secrets, then test.
    const { success, error } = await ErrorNotifications.updateConfig(config);
    if (!success) {
      showToast(t("errorNotifications.toast.saveError", { error }), "error", {
        clear: true,
      });
      return false;
    }
    setHasChanges(false);
    return true;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    await buildPayload();
    setSaving(false);
    showToast(t("errorNotifications.toast.saved"), "success", { clear: true });
  }

  async function handleTest(channel) {
    setTesting(channel);
    if (!(await buildPayload())) {
      setTesting(null);
      return;
    }
    const { success, error } = await ErrorNotifications.test(channel);
    setTesting(null);
    if (success)
      showToast(
        t("errorNotifications.toast.testSent", { channel }),
        "success",
        {
          clear: true,
        }
      );
    else
      showToast(t("errorNotifications.toast.testError", { error }), "error", {
        clear: true,
      });
  }

  async function handleSimulate() {
    setTesting("simulate");
    if (!(await buildPayload())) {
      setTesting(null);
      return;
    }
    const { success, error } = await ErrorNotifications.simulate();
    setTesting(null);
    if (success)
      showToast(t("errorNotifications.toast.simulated"), "success", {
        clear: true,
      });
    else
      showToast(t("errorNotifications.toast.testError", { error }), "error", {
        clear: true,
      });
  }

  return (
    <div className="w-screen h-screen overflow-hidden bg-zinc-950 light:bg-slate-50 flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] light:border light:border-theme-sidebar-border bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
      >
        <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] md:py-6 py-16">
          <div className="w-full flex flex-col gap-y-1 pb-6 border-white/10 border-b-2">
            <p className="text-lg leading-6 font-bold text-theme-text-primary">
              {t("errorNotifications.title")}
            </p>
            <p className="text-xs leading-[18px] font-base text-theme-text-secondary">
              {t("errorNotifications.description")}
            </p>
          </div>

          {loading ? (
            <div className="w-full h-full flex justify-center items-center py-20">
              <PreLoader />
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="flex flex-col w-full max-w-[720px]"
            >
              <Toggle
                size="md"
                enabled={config.enabled}
                onChange={(checked) => patch({ enabled: checked })}
                label={t("errorNotifications.enable.label")}
                description={t("errorNotifications.enable.description")}
                variant="horizontal"
              />

              <Section
                title={t("errorNotifications.serverName.title")}
                description={t("errorNotifications.serverName.description")}
              >
                <Field label={t("errorNotifications.serverName.label")}>
                  <input
                    type="text"
                    className={INPUT_CLASS}
                    autoComplete="off"
                    placeholder={t("errorNotifications.serverName.placeholder")}
                    value={config.serverName}
                    onChange={(e) => patch({ serverName: e.target.value })}
                  />
                </Field>
                <Field label={t("errorNotifications.minInterval.label")}>
                  <input
                    type="number"
                    min={0}
                    className={`${INPUT_CLASS} max-w-[160px]`}
                    autoComplete="off"
                    value={config.minIntervalSec}
                    onChange={(e) =>
                      patch({ minIntervalSec: Number(e.target.value) || 0 })
                    }
                  />
                </Field>
              </Section>

              <Section
                title={t("errorNotifications.capture.title")}
                description={t("errorNotifications.capture.description")}
              >
                <div className="flex flex-col gap-y-3">
                  <Toggle
                    size="md"
                    enabled={config.capture.processCrashes}
                    onChange={(checked) =>
                      patchCapture({ processCrashes: checked })
                    }
                    label={t("errorNotifications.capture.process")}
                    variant="horizontal"
                  />
                  <Toggle
                    size="md"
                    enabled={config.capture.http500}
                    onChange={(checked) => patchCapture({ http500: checked })}
                    label={t("errorNotifications.capture.http")}
                    variant="horizontal"
                  />
                  <Toggle
                    size="md"
                    enabled={config.capture.agentErrors}
                    onChange={(checked) =>
                      patchCapture({ agentErrors: checked })
                    }
                    label={t("errorNotifications.capture.agent")}
                    variant="horizontal"
                  />
                  <Toggle
                    size="md"
                    enabled={config.capture.exitOnFatal}
                    onChange={(checked) =>
                      patchCapture({ exitOnFatal: checked })
                    }
                    label={t("errorNotifications.capture.exitOnFatal")}
                    description={t(
                      "errorNotifications.capture.exitOnFatalHint"
                    )}
                    variant="horizontal"
                  />
                </div>
              </Section>

              <Section
                title={t("errorNotifications.email.title")}
                description={t("errorNotifications.email.description")}
              >
                <Toggle
                  size="md"
                  enabled={config.email.enabled}
                  onChange={(checked) => patchEmail({ enabled: checked })}
                  label={t("errorNotifications.email.enable")}
                  variant="horizontal"
                />
                {config.email.enabled && (
                  <div className="flex flex-col gap-y-3">
                    <div className="flex gap-x-3 w-full max-w-[520px]">
                      <Field label={t("errorNotifications.email.host")}>
                        <input
                          type="text"
                          className={INPUT_CLASS}
                          autoComplete="off"
                          value={config.email.smtpHost}
                          onChange={(e) =>
                            patchEmail({ smtpHost: e.target.value })
                          }
                        />
                      </Field>
                      <Field label={t("errorNotifications.email.port")}>
                        <input
                          type="number"
                          className={`${INPUT_CLASS} w-[100px]`}
                          autoComplete="off"
                          value={config.email.smtpPort}
                          onChange={(e) =>
                            patchEmail({ smtpPort: Number(e.target.value) })
                          }
                        />
                      </Field>
                    </div>
                    <Toggle
                      size="md"
                      enabled={config.email.secure}
                      onChange={(checked) => patchEmail({ secure: checked })}
                      label={t("errorNotifications.email.secure")}
                      description={t("errorNotifications.email.secureHint")}
                      variant="horizontal"
                    />
                    <Field label={t("errorNotifications.email.user")}>
                      <input
                        type="text"
                        className={INPUT_CLASS}
                        autoComplete="off"
                        value={config.email.authUser}
                        onChange={(e) =>
                          patchEmail({ authUser: e.target.value })
                        }
                      />
                    </Field>
                    <Field label={t("errorNotifications.email.pass")}>
                      <input
                        type="password"
                        className={INPUT_CLASS}
                        autoComplete="new-password"
                        placeholder={
                          config.email.hasAuthPass
                            ? t("errorNotifications.email.passSaved")
                            : ""
                        }
                        value={config.email.authPass}
                        onChange={(e) =>
                          patchEmail({ authPass: e.target.value })
                        }
                      />
                    </Field>
                    <Field label={t("errorNotifications.email.from")}>
                      <input
                        type="email"
                        className={INPUT_CLASS}
                        autoComplete="off"
                        value={config.email.from}
                        onChange={(e) => patchEmail({ from: e.target.value })}
                      />
                    </Field>
                    <Field label={t("errorNotifications.email.to")}>
                      <input
                        type="text"
                        className={INPUT_CLASS}
                        autoComplete="off"
                        placeholder={t("errorNotifications.email.toHint")}
                        value={config.email.to}
                        onChange={(e) => patchEmail({ to: e.target.value })}
                      />
                    </Field>
                    <button
                      type="button"
                      disabled={
                        testing !== null ||
                        !config.email.smtpHost ||
                        !config.email.to
                      }
                      onClick={() => handleTest("email")}
                      className="transition-all mt-1 w-fit duration-300 border border-slate-200 px-4 py-2 rounded-lg text-theme-text-primary text-sm hover:bg-slate-200 hover:text-slate-800 disabled:opacity-50"
                    >
                      {testing === "email"
                        ? t("errorNotifications.sending")
                        : t("errorNotifications.email.test")}
                    </button>
                  </div>
                )}
              </Section>

              <Section
                title={t("errorNotifications.telegram.title")}
                description={t("errorNotifications.telegram.description")}
              >
                <Toggle
                  size="md"
                  enabled={config.telegram.enabled}
                  onChange={(checked) => patchTelegram({ enabled: checked })}
                  label={t("errorNotifications.telegram.enable")}
                  variant="horizontal"
                />
                {config.telegram.enabled && (
                  <div className="flex flex-col gap-y-3">
                    <Field label={t("errorNotifications.telegram.token")}>
                      <input
                        type="password"
                        className={INPUT_CLASS}
                        autoComplete="new-password"
                        placeholder={
                          config.telegram.hasBotToken
                            ? t("errorNotifications.telegram.tokenSaved")
                            : ""
                        }
                        value={config.telegram.botToken}
                        onChange={(e) =>
                          patchTelegram({ botToken: e.target.value })
                        }
                      />
                    </Field>
                    <Field label={t("errorNotifications.telegram.chatId")}>
                      <input
                        type="text"
                        className={INPUT_CLASS}
                        autoComplete="off"
                        placeholder={t(
                          "errorNotifications.telegram.chatIdHint"
                        )}
                        value={config.telegram.chatId}
                        onChange={(e) =>
                          patchTelegram({ chatId: e.target.value })
                        }
                      />
                    </Field>
                    <button
                      type="button"
                      disabled={
                        testing !== null ||
                        !config.telegram.chatId ||
                        (!config.telegram.botToken &&
                          !config.telegram.hasBotToken)
                      }
                      onClick={() => handleTest("telegram")}
                      className="transition-all mt-1 w-fit duration-300 border border-slate-200 px-4 py-2 rounded-lg text-theme-text-primary text-sm hover:bg-slate-200 hover:text-slate-800 disabled:opacity-50"
                    >
                      {testing === "telegram"
                        ? t("errorNotifications.sending")
                        : t("errorNotifications.telegram.test")}
                    </button>
                  </div>
                )}
              </Section>

              <div className="flex flex-col gap-y-3 my-4">
                <button
                  type="button"
                  disabled={testing !== null}
                  onClick={handleSimulate}
                  className="transition-all w-fit duration-300 border border-theme-sidebar-border px-5 py-2.5 rounded-lg text-theme-text-primary text-sm hover:bg-theme-action-menu-item-hover disabled:opacity-50"
                >
                  {testing === "simulate"
                    ? t("errorNotifications.sending")
                    : t("errorNotifications.simulate")}
                </button>
              </div>

              {hasChanges && (
                <button
                  type="submit"
                  disabled={saving}
                  className="transition-all mt-2 mb-8 w-fit duration-300 border border-slate-200 px-5 py-2.5 rounded-lg text-white text-sm items-center flex gap-x-2 hover:bg-slate-200 hover:text-slate-800 focus:ring-gray-800 disabled:opacity-50"
                >
                  {saving
                    ? t("errorNotifications.saving")
                    : t("errorNotifications.save")}
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
