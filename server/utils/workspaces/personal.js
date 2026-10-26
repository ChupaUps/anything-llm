/**
 * Personal workspaces are workspaces created by a `default` user to use the
 * instance as their own private RAG space. Their documents all live in a single
 * folder of the shared documents storage so a user can only ever see, embed and
 * delete their own data. Admins and managers keep unrestricted access to every
 * folder and workspace.
 */
const { ROLES } = require("../middleware/multiUserProtected");

const PERSONAL_FOLDER_PREFIX = "personal-user-";

/**
 * The documents storage folder owned by a user.
 * @param {{id: number}|null} user
 * @returns {string|null} `personal-user-<id>` or null when there is no user
 */
function personalDocumentsFolder(user = null) {
  if (!user?.id) return null;
  return `${PERSONAL_FOLDER_PREFIX}${user.id}`;
}

/**
 * Users with these roles can read and manage every workspace and document.
 * @param {{role: string}|null} user
 * @returns {boolean}
 */
function hasGlobalWorkspaceAccess(user = null) {
  return [ROLES.admin, ROLES.manager].includes(user?.role);
}

/**
 * @param {object|null} workspace
 * @returns {boolean}
 */
function isPersonalWorkspace(workspace = null) {
  return Boolean(workspace?.is_personal);
}

/**
 * @param {{id: number}|null} user
 * @param {object|null} workspace
 * @returns {boolean}
 */
function ownsPersonalWorkspace(user = null, workspace = null) {
  if (!user?.id || !isPersonalWorkspace(workspace) || !workspace?.owner_id)
    return false;
  return Number(workspace.owner_id) === Number(user.id);
}

/**
 * Whether the user may modify the RAG data (upload, embed, unembed, delete
 * documents) of a workspace. In single-user mode there is no user and
 * everything is allowed. Admins and managers can manage any workspace, while
 * a `default` user is limited to the personal workspaces they own.
 * @param {{id: number, role: string}|null} user
 * @param {object|null} workspace
 * @returns {boolean}
 */
function canManageWorkspaceData(user = null, workspace = null) {
  if (!user) return true; // Single-user mode has no session user.
  if (hasGlobalWorkspaceAccess(user)) return true;
  return ownsPersonalWorkspace(user, workspace);
}

/**
 * The only folder a user is allowed to read documents from. Returns null for
 * users with global access so callers can skip scoping entirely.
 * @param {{id: number, role: string}|null} user
 * @returns {string|null}
 */
function scopedDocumentsFolder(user = null) {
  if (!user || hasGlobalWorkspaceAccess(user)) return null;
  return personalDocumentsFolder(user);
}

/**
 * Checks that a `folder/file.json` docpath lives in the given folder.
 * A null folder means "no restriction".
 * @param {string} docpath
 * @param {string|null} folder
 * @returns {boolean}
 */
function isDocPathWithinFolder(docpath = "", folder = null) {
  if (!folder) return true;
  if (typeof docpath !== "string" || !docpath.trim()) return false;
  const segments = docpath.split(/[/\\]/).filter(Boolean);
  return segments.length === 2 && segments[0] === folder;
}

module.exports = {
  PERSONAL_FOLDER_PREFIX,
  personalDocumentsFolder,
  hasGlobalWorkspaceAccess,
  isPersonalWorkspace,
  ownsPersonalWorkspace,
  canManageWorkspaceData,
  scopedDocumentsFolder,
  isDocPathWithinFolder,
};
