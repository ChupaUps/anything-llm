import { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal, {
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalInput,
  ModalLabel,
  ModalHint,
  ModalPrimaryButton,
  ModalSecondaryButton,
} from "@/components/lib/Modal";
import WorkspaceSQLConnector from "@/models/workspaceSQLConnector";
import showToast from "@/utils/toast";
import { CheckCircle, WarningOctagon, XCircle } from "@phosphor-icons/react";
import { DB_LOGOS } from "./SQLConnectorCard";

const ENGINES = ["postgresql", "mysql", "sql-server"];
const DEFAULT_PORTS = {
  postgresql: "5432",
  mysql: "3306",
  "sql-server": "1433",
};

/**
 * Builds the RFC connection string the server encrypts and the SQL connectors
 * understand. Returns null while some of the required fields are empty.
 * @param {object} form
 * @returns {string|null}
 */
function assembleConnectionString(form = {}) {
  const { engine, username, password, host, port, database } = form;
  if (
    ![username, password, host, database].every(
      (part) => !!String(part || "").trim()
    )
  )
    return null;

  const user = encodeURIComponent(String(username).trim());
  const secret = encodeURIComponent(String(password));
  const name = encodeURIComponent(String(database).trim());
  const resolvedPort = String(port || "").trim() || DEFAULT_PORTS[engine];
  const address = `${String(host).trim()}:${resolvedPort}`;

  switch (engine) {
    case "postgresql":
      return `postgres://${user}:${secret}@${address}/${name}${
        form.ssl ? "?sslmode=no-verify" : ""
      }`;
    case "mysql":
      return `mysql://${user}:${secret}@${address}/${name}`;
    case "sql-server":
      return `mssql://${user}:${secret}@${address}/${name}?encrypt=${Boolean(
        form.encrypt
      )}`;
    default:
      return null;
  }
}

/** Password is never shown in the form preview. */
function maskedString(connectionString = "") {
  return String(connectionString).replace(/:\/\/([^:]+):[^@]*@/, "://$1:***@");
}

/**
 * Create/edit form for one SQL database of the workspace. Credentials are
 * verified with a real connection before saving and are encrypted at rest.
 */
export default function SQLConnectorForm({
  slug,
  connector,
  onClose,
  onSaved,
}) {
  const { t } = useTranslation();
  const isEdit = !!connector?.id;
  const [engine, setEngine] = useState(connector?.engine || "postgresql");
  const [form, setForm] = useState({
    name: connector?.name || "",
    description: connector?.description || "",
    username: "",
    password: "",
    host: "",
    port: "",
    database: "",
    schema: connector?.schema || "",
    encrypt: false,
    ssl: false,
    enabled: connector?.enabled !== false,
  });
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState(null);

  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  const filledParts = ["username", "password", "host", "database"].filter(
    (key) => !!String(form[key] || "").trim()
  );
  const credentialsFilled = filledParts.length === 4;
  const credentialsPartial = filledParts.length > 0 && !credentialsFilled;
  const connectionString = credentialsFilled
    ? assembleConnectionString({ engine, ...form })
    : null;
  const canSave =
    !!form.name.trim() &&
    !saving &&
    !credentialsPartial &&
    (isEdit || credentialsFilled);

  const checkConnection = async () => {
    if (!connectionString)
      return showToast(t("sqlConnector.credentialsRequired"), "error", {
        clear: true,
      });
    setChecking(true);
    const result = await WorkspaceSQLConnector.validate(
      slug,
      engine,
      connectionString
    );
    setCheck(result);
    setChecking(false);
    return result;
  };

  const handleSave = async () => {
    if (!canSave) return;
    if (!credentialsFilled && isEdit && engine !== connector.engine)
      return showToast(t("sqlConnector.engineNeedsCredentials"), "error", {
        clear: true,
      });

    setSaving(true);
    // Re-typed credentials are verified before they are stored, so a typo in
    // the password cannot silently break the chat.
    if (credentialsFilled) {
      const result = await checkConnection();
      if (!result?.success) {
        setSaving(false);
        return showToast(
          result?.error || t("sqlConnector.testFailed"),
          "error",
          { clear: true }
        );
      }
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      enabled: form.enabled,
    };
    if (credentialsFilled)
      Object.assign(payload, {
        engine,
        connectionString,
        schema: engine === "postgresql" ? form.schema.trim() || null : null,
      });

    const result = isEdit
      ? await WorkspaceSQLConnector.update(slug, connector.id, payload)
      : await WorkspaceSQLConnector.create(slug, payload);
    setSaving(false);
    if (!result.connector)
      return showToast(result.error || t("sqlConnector.saveError"), "error", {
        clear: true,
      });

    showToast(t("sqlConnector.saved"), "success");
    onSaved();
    onClose();
  };

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <ModalHeader
        title={
          isEdit ? t("sqlConnector.editTitle") : t("sqlConnector.addTitle")
        }
        onClose={onClose}
      />
      <ModalBody>
        <p className="text-sm text-zinc-400 light:text-slate-600">
          {t("sqlConnector.formSubtitle")}
        </p>

        <div className="rounded-lg border border-red-700/50 bg-red-500/10 p-3 flex items-start gap-x-2 text-xs text-red-300 light:text-red-600">
          <WarningOctagon size={20} className="shrink-0" />
          <p>{t("sqlConnector.readOnlyWarning")}</p>
        </div>

        <div className="flex flex-col gap-y-2">
          <ModalLabel>{t("sqlConnector.engine")}</ModalLabel>
          <div className="grid grid-cols-3 gap-3">
            {ENGINES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setEngine(option)}
                className={`flex flex-col items-center gap-y-2 p-3 rounded-lg border transition-colors duration-200 ${
                  engine === option
                    ? "border-sky-500 bg-sky-500/10"
                    : "border-white/10 light:border-slate-300 hover:bg-theme-settings-input-bg"
                }`}
              >
                <img
                  src={DB_LOGOS[option]}
                  alt={option}
                  className="h-10 object-contain"
                />
                <span className="text-xs text-white/70 light:text-slate-600">
                  {t(`sqlConnector.engine_${option}`)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <ModalInput
          label={t("sqlConnector.name")}
          name="sql-connector-name"
          value={form.name}
          placeholder={t("sqlConnector.namePlaceholder")}
          onChange={(e) => update("name", e.target.value)}
          hint={t("sqlConnector.nameHint")}
        />

        <ModalInput
          label={t("sqlConnector.descriptionLabel")}
          name="sql-connector-description"
          optional
          value={form.description}
          placeholder={t("sqlConnector.descriptionPlaceholder")}
          onChange={(e) => update("description", e.target.value)}
          hint={t("sqlConnector.descriptionHint")}
        />

        <div className="flex flex-col gap-y-1">
          <ModalLabel>{t("sqlConnector.connectionDetails")}</ModalLabel>
          <ModalHint>
            {isEdit
              ? t("sqlConnector.credentialsKeepHint")
              : t("sqlConnector.credentialsHint")}
          </ModalHint>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ModalInput
            label={t("sqlConnector.username")}
            name="sql-connector-username"
            value={form.username}
            placeholder={t("sqlConnector.usernamePlaceholder")}
            onChange={(e) => update("username", e.target.value)}
          />
          <ModalInput
            label={t("sqlConnector.password")}
            name="sql-connector-password"
            type="password"
            value={form.password}
            placeholder={t("sqlConnector.passwordPlaceholder")}
            onChange={(e) => update("password", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <ModalInput
              label={t("sqlConnector.host")}
              name="sql-connector-host"
              value={form.host}
              placeholder={t("sqlConnector.hostPlaceholder")}
              onChange={(e) => update("host", e.target.value)}
            />
          </div>
          <ModalInput
            label={t("sqlConnector.port")}
            name="sql-connector-port"
            optional
            value={form.port}
            placeholder={DEFAULT_PORTS[engine]}
            onChange={(e) => update("port", e.target.value)}
          />
        </div>

        <ModalInput
          label={t("sqlConnector.database")}
          name="sql-connector-database"
          value={form.database}
          placeholder={t("sqlConnector.databasePlaceholder")}
          onChange={(e) => update("database", e.target.value)}
        />

        {engine === "postgresql" && (
          <ModalInput
            label={t("sqlConnector.schema")}
            name="sql-connector-schema"
            optional
            value={form.schema}
            placeholder="public"
            onChange={(e) => update("schema", e.target.value)}
            hint={t("sqlConnector.schemaHint")}
          />
        )}

        {engine === "sql-server" && (
          <label className="flex items-center gap-x-2 text-sm text-white/70 light:text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={form.encrypt}
              onChange={(e) => update("encrypt", e.target.checked)}
              className="accent-sky-500"
            />
            {t("sqlConnector.encrypt")}
          </label>
        )}

        {engine === "postgresql" && (
          <label className="flex items-center gap-x-2 text-sm text-white/70 light:text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={form.ssl}
              onChange={(e) => update("ssl", e.target.checked)}
              className="accent-sky-500"
            />
            {t("sqlConnector.ssl")}
          </label>
        )}

        {connectionString && (
          <p className="text-xs text-zinc-400 light:text-slate-500 font-mono break-all">
            {maskedString(connectionString)}
          </p>
        )}

        {credentialsPartial && (
          <p className="text-xs text-amber-400">
            {t("sqlConnector.credentialsPartial")}
          </p>
        )}

        {check && <CheckResult result={check} />}

        <div className="flex items-center justify-between gap-x-3">
          <label className="flex items-center gap-x-2 text-sm text-white/70 light:text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => update("enabled", e.target.checked)}
              className="accent-sky-500"
            />
            {t("sqlConnector.enabled")}
          </label>
          <ModalSecondaryButton
            type="button"
            onClick={checkConnection}
            disabled={checking || !connectionString}
          >
            {checking ? t("sqlConnector.checking") : t("sqlConnector.check")}
          </ModalSecondaryButton>
        </div>
      </ModalBody>
      <ModalFooter>
        <ModalSecondaryButton type="button" onClick={onClose}>
          {t("sqlConnector.cancel")}
        </ModalSecondaryButton>
        <ModalPrimaryButton
          type="button"
          onClick={handleSave}
          disabled={!canSave}
        >
          {saving ? t("sqlConnector.saving") : t("sqlConnector.save")}
        </ModalPrimaryButton>
      </ModalFooter>
    </Modal>
  );
}

function CheckResult({ result }) {
  const { t } = useTranslation();
  const ok = Boolean(result?.success);
  return (
    <div
      className={`rounded-lg border p-3 flex flex-col gap-y-1 ${
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
          {ok ? t("sqlConnector.testOk") : t("sqlConnector.testFailed")}
        </span>
      </div>
      {result?.error && (
        <p className="text-xs text-red-300 break-words">{result.error}</p>
      )}
    </div>
  );
}
