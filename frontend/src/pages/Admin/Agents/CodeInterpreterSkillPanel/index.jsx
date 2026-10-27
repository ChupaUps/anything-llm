import React, { useEffect, useState } from "react";
import Toggle, { SimpleToggleSwitch } from "@/components/lib/Toggle";
import { useTranslation } from "react-i18next";
import { Warning, CircleNotch, ShieldCheck } from "@phosphor-icons/react";
import Admin from "@/models/admin";
import { getCodeInterpreterSkills } from "./utils";

const SETTINGS_KEY = "disabled_code_interpreter_skills";

export default function CodeInterpreterSkillPanel({
  title,
  skill,
  toggleSkill,
  enabled = false,
  disabled = false,
  icon,
  setHasChanges,
}) {
  const { t } = useTranslation();
  const [disabledSubSkills, setDisabledSubSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const subSkills = getCodeInterpreterSkills(t);

  useEffect(() => {
    Admin.systemPreferencesByFields([SETTINGS_KEY])
      .then((res) => setDisabledSubSkills(res?.settings?.[SETTINGS_KEY] ?? []))
      .catch(() => setDisabledSubSkills([]))
      .finally(() => setLoading(false));
  }, []);

  function toggleSubSkill(subSkillName) {
    setHasChanges?.(true);
    setDisabledSubSkills((prev) =>
      prev.includes(subSkillName)
        ? prev.filter((name) => name !== subSkillName)
        : [...prev, subSkillName]
    );
  }

  return (
    <div className="p-2">
      <div className="flex flex-col gap-y-[18px] max-w-[500px]">
        <div className="flex w-full justify-between items-center">
          <div className="flex items-center gap-x-2">
            {icon &&
              React.createElement(icon, {
                size: 24,
                color: "var(--theme-text-primary)",
                weight: "bold",
              })}
            <label className="text-theme-text-primary text-md font-bold">
              {title}
            </label>
          </div>
          <Toggle
            size="lg"
            enabled={enabled}
            disabled={disabled}
            onChange={() => toggleSkill(skill)}
          />
        </div>

        <WarningBanner />

        <div className="flex items-start gap-x-2.5 p-2.5 bg-emerald-800/20 light:bg-emerald-800/10 text-emerald-400 light:text-emerald-600 border border-emerald-400/30 rounded-lg items-center">
          <ShieldCheck
            size={20}
            className="flex-shrink-0 mt-0.5"
            weight="fill"
          />
          <p className="text-xs font-medium">
            {t("agent.skill.codeInterpreter.isolation")}
          </p>
        </div>

        <div className="flex flex-col gap-y-1">
          <p className="text-theme-text-secondary text-opacity-60 text-xs font-medium">
            {t("agent.skill.codeInterpreter.description")}
          </p>
          <p className="text-theme-text-secondary text-opacity-60 text-xs font-medium">
            {t("agent.skill.codeInterpreter.runtime")}
          </p>
        </div>

        {enabled && (
          <>
            <input
              name={`system::${SETTINGS_KEY}`}
              type="hidden"
              value={disabledSubSkills.join(",")}
            />
            <div className="flex flex-col mt-2 gap-y-4">
              <p className="text-theme-text-primary font-semibold text-sm">
                {t("agent.skill.codeInterpreter.configuration")}
              </p>
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <CircleNotch
                    size={24}
                    className="animate-spin text-theme-text-primary"
                  />
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-y-1">
                    <p className="text-theme-text-secondary text-xs font-medium uppercase tracking-wide">
                      {t("agent.skill.codeInterpreter.executionActions")}
                    </p>
                    {subSkills
                      .filter((subSkill) => subSkill.category === "execution")
                      .map((subSkill) => (
                        <SubSkillRow
                          key={subSkill.name}
                          subSkill={subSkill}
                          disabled={disabledSubSkills.includes(subSkill.name)}
                          onToggle={() => toggleSubSkill(subSkill.name)}
                          isWriteOperation
                        />
                      ))}
                  </div>

                  <div className="flex flex-col gap-y-1">
                    <p className="text-theme-text-secondary text-xs font-medium uppercase tracking-wide">
                      {t("agent.skill.codeInterpreter.fileActions")}
                    </p>
                    {subSkills
                      .filter((subSkill) => subSkill.category !== "execution")
                      .map((subSkill) => (
                        <SubSkillRow
                          key={subSkill.name}
                          subSkill={subSkill}
                          disabled={disabledSubSkills.includes(subSkill.name)}
                          onToggle={() => toggleSubSkill(subSkill.name)}
                        />
                      ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function WarningBanner() {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-x-2.5 p-2.5 bg-orange-800/20 light:bg-orange-800/10 text-orange-400 light:text-orange-600 border border-orange-400/30 rounded-lg items-center">
      <Warning size={20} className="flex-shrink-0 mt-0.5" weight="fill" />
      <p className="text-xs font-medium">
        {t("agent.skill.codeInterpreter.warning")}
      </p>
    </div>
  );
}

function SubSkillRow({ subSkill, disabled, onToggle, isWriteOperation }) {
  const Icon = subSkill.icon;
  return (
    <div
      className={`flex items-center justify-between p-2 rounded-lg border ${
        disabled
          ? "bg-theme-bg-secondary/30 border-theme-sidebar-border/30"
          : isWriteOperation
            ? "bg-orange-900/10 border-orange-400/20 light:bg-orange-800/10 text-orange-400 light:text-orange-600"
            : "bg-theme-bg-secondary/50 border-theme-sidebar-border/50"
      }`}
    >
      <div className="flex items-center gap-x-2">
        <Icon
          size={16}
          className={
            disabled
              ? "text-theme-text-secondary/50"
              : isWriteOperation
                ? "text-orange-400"
                : "text-theme-text-primary"
          }
          weight="bold"
        />
        <div className="flex flex-col">
          <span
            className={`text-sm font-medium ${disabled ? "text-theme-text-secondary/50" : "text-theme-text-primary"}`}
          >
            {subSkill.title}
          </span>
          <span
            className={`text-xs ${disabled ? "text-theme-text-secondary/40" : "text-theme-text-secondary"}`}
          >
            {subSkill.description}
          </span>
        </div>
      </div>
      <SimpleToggleSwitch enabled={!disabled} onChange={onToggle} size="md" />
    </div>
  );
}
