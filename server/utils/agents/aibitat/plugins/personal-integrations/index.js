const { ReadEmail } = require("./read-email.js");
const { CreateEmailDraft } = require("./create-email-draft.js");
const { CreateCalendarEvent } = require("./create-calendar-event.js");

/**
 * Parent plugin that bundles the per-workspace mail / calendar tools.
 *
 * Loaded only when a workspace has at least one `workspace_integrations` row
 * (see `personalIntegrationsSkillIfAvailable` in defaults.js) and only the
 * sub-tools whose scope is actually granted on the row are pushed into the
 * agent's function list.
 */
const personalIntegrationsAgent = {
  name: "personal-integrations",
  startupConfig: {
    params: {},
  },
  plugin: [ReadEmail, CreateEmailDraft, CreateCalendarEvent],
};

module.exports = {
  personalIntegrationsAgent,
};
