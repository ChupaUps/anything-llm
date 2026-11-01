const path = require("path");
const fs = require("fs");
const { getType } = require("mime");
const { SystemSettings } = require("../../models/systemSettings");
const { normalizePath, isWithin } = require(".");
const { renameLogoFile, removeCustomLogo, validFilename } = require("./logo");

/**
 * The assistant avatar shown next to every model reply inside the chat embed
 * widget. It lives in the same `storage/assets` folder as the instance logo and
 * is stored as a system setting, so it can be changed at runtime without a
 * rebuild and is read by the anonymous embed page.
 */
const ASSISTANT_ICON_SETTING = "embed_assistant_icon_filename";

function assetsDirectory() {
  return process.env.STORAGE_DIR
    ? path.join(process.env.STORAGE_DIR, "assets")
    : path.join(__dirname, "../../storage/assets");
}

/**
 * Resolve the absolute path of the uploaded assistant icon.
 * @returns {Promise<string|null>} null when nothing was uploaded or the file is gone
 */
async function determineAssistantIconFilepath() {
  const filename = (await SystemSettings.get({ label: ASSISTANT_ICON_SETTING }))
    ?.value;
  if (!filename || !validFilename(filename)) return null;

  const base = assetsDirectory();
  const iconPath = path.join(base, normalizePath(filename));
  if (!isWithin(path.resolve(base), path.resolve(iconPath))) return null;
  return fs.existsSync(iconPath) ? iconPath : null;
}

/**
 * @returns {Promise<{found: boolean, buffer: Buffer|null, size: number, mime: string}>}
 */
async function fetchAssistantIcon() {
  const iconPath = await determineAssistantIconFilepath();
  if (!iconPath)
    return { found: false, buffer: null, size: 0, mime: "none/none" };

  return {
    found: true,
    buffer: fs.readFileSync(iconPath),
    size: fs.statSync(iconPath).size,
    mime: getType(iconPath) || "image/png",
  };
}

async function hasAssistantIcon() {
  return (await determineAssistantIconFilepath()) !== null;
}

/**
 * Promote the just-uploaded file in `storage/assets` to a random name and point
 * the setting at it, deleting whatever icon was there before.
 * @param {string} originalFilename - filename as written by the multer asset upload
 */
async function saveAssistantIcon(originalFilename) {
  const previous = (await SystemSettings.get({ label: ASSISTANT_ICON_SETTING }))
    ?.value;
  const newFilename = await renameLogoFile(originalFilename);
  if (previous) await removeCustomLogo(previous);
  const { success, error } = await SystemSettings._updateSettings({
    [ASSISTANT_ICON_SETTING]: newFilename,
  });
  if (!success) await removeCustomLogo(newFilename);
  return { success, error, filename: newFilename };
}

async function removeAssistantIcon() {
  const current = (await SystemSettings.get({ label: ASSISTANT_ICON_SETTING }))
    ?.value;
  if (current) await removeCustomLogo(current);
  return SystemSettings._updateSettings({ [ASSISTANT_ICON_SETTING]: null });
}

module.exports = {
  ASSISTANT_ICON_SETTING,
  determineAssistantIconFilepath,
  fetchAssistantIcon,
  hasAssistantIcon,
  saveAssistantIcon,
  removeAssistantIcon,
};
