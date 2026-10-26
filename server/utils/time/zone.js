/**
 * System time zone helpers.
 *
 * The administrator picks one IANA zone for the whole instance. Prisma stores
 * every DateTime as naive UTC, so changing the zone never rewrites existing
 * rows - it only changes how those instants are grouped into days and where the
 * reporting period boundaries fall.
 */

const DEFAULT_TIME_ZONE = "UTC";

// Intl formatters are expensive to build and are reused for every bucketed day.
const formatters = new Map();

/**
 * @param {string} timeZone
 * @returns {boolean} true for a recognised IANA identifier
 */
function isValidTimeZone(timeZone) {
  if (!timeZone || typeof timeZone !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * Picks the first usable zone: the requested one, then the process zone
 * (TZ env or an already applied setting), then UTC.
 * @param {string|null|undefined} candidate
 * @returns {string}
 */
function resolveTimeZone(candidate) {
  if (isValidTimeZone(candidate)) return candidate;
  if (isValidTimeZone(process.env.TZ)) return process.env.TZ;
  return DEFAULT_TIME_ZONE;
}

function formatterFor(timeZone) {
  if (formatters.has(timeZone)) return formatters.get(timeZone);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  formatters.set(timeZone, formatter);
  return formatter;
}

/**
 * Wall-clock parts of an instant in `timeZone`.
 * @param {Date} date
 * @param {string} timeZone
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, second: number }}
 */
function zonedParts(date, timeZone) {
  const values = {};
  for (const part of formatterFor(timeZone).formatToParts(date))
    if (part.type !== "literal") values[part.type] = part.value;

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    // Some locales report midnight as "24" with hour12: false.
    hour: Number(values.hour) % 24,
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

/**
 * Offset of `timeZone` at `date` in milliseconds (positive = ahead of UTC).
 * @param {Date} date
 * @param {string} timeZone
 * @returns {number}
 */
function zoneOffsetMs(date, timeZone) {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * UTC instant of local midnight for a wall date in `timeZone`. The offset is
 * measured twice so a DST transition around midnight cannot shift the boundary.
 * @param {{ year: number, month: number, day: number }} wall
 * @param {string} timeZone
 * @returns {Date}
 */
function zonedMidnight({ year, month, day }, timeZone) {
  const wall = Date.UTC(year, month - 1, day);
  const firstGuess = wall - zoneOffsetMs(new Date(wall), timeZone);
  return new Date(wall - zoneOffsetMs(new Date(firstGuess), timeZone));
}

/**
 * Moves a wall date by whole days without touching instants (DST safe).
 * @param {{ year: number, month: number, day: number }} wall
 * @param {number} delta
 * @returns {{ year: number, month: number, day: number }}
 */
function addDays({ year, month, day }, delta) {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + delta);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

/**
 * @param {{ year: number, month: number, day: number }} wall
 * @returns {string} `YYYY-MM-DD`
 */
function wallDayKey({ year, month, day }) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;
}

/**
 * Applies a zone to the running process so Node's own Date/Intl formatting,
 * log timestamps and per-user tooling all agree with the dashboard.
 * @param {string} timeZone
 * @returns {string} the applied zone
 */
function applySystemTimeZone(timeZone) {
  const { UserMetaCache } = require("../userLocale");
  const resolved = resolveTimeZone(timeZone);
  process.env.TZ = resolved;
  UserMetaCache.setDefaultTimeZone(resolved);
  return resolved;
}

/**
 * Boot-time variant: reads the stored setting and applies it.
 * @returns {Promise<string>} the applied zone
 */
async function applyStoredSystemTimeZone() {
  try {
    const { SystemSettings } = require("../../models/systemSettings");
    return applySystemTimeZone(await SystemSettings.systemTimeZone());
  } catch (error) {
    console.error(
      `\x1b[33m[SystemTimeZone]\x1b[0m Could not apply the stored time zone: ${error.message}`
    );
    return applySystemTimeZone(DEFAULT_TIME_ZONE);
  }
}

module.exports = {
  DEFAULT_TIME_ZONE,
  isValidTimeZone,
  resolveTimeZone,
  zonedParts,
  zonedMidnight,
  addDays,
  wallDayKey,
  applySystemTimeZone,
  applyStoredSystemTimeZone,
};
