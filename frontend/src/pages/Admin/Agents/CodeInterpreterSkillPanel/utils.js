import {
  Terminal,
  UploadSimple,
  Files,
  ArrowsCounterClockwise,
} from "@phosphor-icons/react";

/**
 * Sub-skills exposed by the code-interpreter skill. Names must match the
 * `name` of the aibitat plugins in server/utils/agents/aibitat/plugins/code-interpreter.
 * @param {function} t - i18n translator
 * @returns {Array<{name: string, title: string, description: string, icon: object, category: string}>}
 */
export const getCodeInterpreterSkills = (t) => [
  {
    name: "code-run",
    title: t("agent.skill.codeInterpreter.skills.run.title"),
    description: t("agent.skill.codeInterpreter.skills.run.description"),
    icon: Terminal,
    category: "execution",
  },
  {
    name: "code-upload-file",
    title: t("agent.skill.codeInterpreter.skills.upload.title"),
    description: t("agent.skill.codeInterpreter.skills.upload.description"),
    icon: UploadSimple,
    category: "files",
  },
  {
    name: "code-list-files",
    title: t("agent.skill.codeInterpreter.skills.list.title"),
    description: t("agent.skill.codeInterpreter.skills.list.description"),
    icon: Files,
    category: "files",
  },
  {
    name: "code-reset-sandbox",
    title: t("agent.skill.codeInterpreter.skills.reset.title"),
    description: t("agent.skill.codeInterpreter.skills.reset.description"),
    icon: ArrowsCounterClockwise,
    category: "maintenance",
  },
];
