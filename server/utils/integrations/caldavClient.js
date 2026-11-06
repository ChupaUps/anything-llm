/**
 * Minimal CalDAV client used by the Yandex calendar integration.
 *
 * Only two verbs are implemented - PROPFIND to discover calendar collections
 * and PUT to create a VEVENT. Both go through HTTPS basic auth with the same
 * app password that IMAP/SMTP use. Everything is intentionally hand-rolled on
 * top of node's `https` to avoid a heavyweight dependency for a couple of
 * requests a day.
 */

const https = require("https");
const { URL } = require("url");

const DEFAULT_TIMEOUT_MS = 20_000;

function request({
  method,
  url,
  user,
  password,
  body = null,
  headers = {},
}) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(url);
    } catch (error) {
      reject(new Error(`Некорректный CalDAV URL: ${url}`));
      return;
    }
    const auth = Buffer.from(`${user}:${password}`).toString("base64");
    const payload = body ? Buffer.from(body, "utf-8") : null;
    const req = https.request(
      {
        method,
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/xml, text/xml, text/calendar, */*",
          ...(payload
            ? { "Content-Length": payload.length, "Content-Type": headers["Content-Type"] || "text/calendar; charset=utf-8" }
            : {}),
          ...headers,
        },
        timeout: DEFAULT_TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf-8"),
          })
        );
      }
    );
    req.on("timeout", () => req.destroy(new Error("CalDAV timeout")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Lists all calendars the account exposes so the UI can offer a picker and
 * the agent can create events in the right one.
 */
async function discoverCalendars(integration) {
  if (!integration.caldav_url)
    return { success: false, error: "Провайдер не поддерживает CalDAV", calendars: [] };
  const base = integration.caldav_url.replace(/\/$/, "");
  const user = integration.auth_user;
  const href = `${base}/${encodeURIComponent(user)}/`;
  const xml = `<propfind xmlns="DAV:"><prop><displayname xmlns="DAV:"/><resourcetype xmlns="DAV:"/><calendar-description xmlns="urn:ietf:params:xml:ns:caldav"/></prop></propfind>`;
  try {
    const res = await request({
      method: "PROPFIND",
      url: href,
      user,
      password: integration.password,
      body: xml,
      headers: { "Content-Type": "application/xml", Depth: "1" },
    });
    if (res.status >= 400)
      return {
        success: false,
        error: `CalDAV ${res.status}: ${truncate(res.body, 200)}`,
        calendars: [],
      };
    return { success: true, calendars: parseMultistatus(res.body), error: null };
  } catch (error) {
    return { success: false, error: error.message, calendars: [] };
  }
}

/**
 * Creates a single VEVENT in the chosen calendar. `calendarPath` is either the
 * user's stored override or the first collection returned by `discoverCalendars`.
 */
async function createEvent(integration, event = {}) {
  if (!integration.caldav_url)
    return { success: false, error: "Провайдер не поддерживает CalDAV" };

  const calendars = await discoverCalendars(integration);
  if (!calendars.success)
    return { success: false, error: calendars.error };
  const target = pickCalendarPath(integration, calendars.calendars);
  if (!target)
    return {
      success: false,
      error: "Не нашли ни одного календаря на сервере",
    };

  const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}@anythingllm.local`;
  const ics = buildVEvent({ ...event, uid });
  const href = joinUrl(integration.caldav_url, target, `${uid}.ics`);
  try {
    const res = await request({
      method: "PUT",
      url: href,
      user: integration.auth_user,
      password: integration.password,
      body: ics,
      headers: { "Content-Type": "text/calendar; charset=utf-8", "If-None-Match": "*" },
    });
    if (res.status === 201 || res.status === 204) {
      return {
        success: true,
        error: null,
        event: {
          uid,
          calendar: target,
          location: href,
          summary: event.summary,
          start: event.start,
          end: event.end,
        },
      };
    }
    return {
      success: false,
      error: `CalDAV ${res.status}: ${truncate(res.body, 200)}`,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function pickCalendarPath(integration, calendars = []) {
  if (integration.calendar_path) {
    const match = calendars.find(
      (c) => c.path === integration.calendar_path || c.href === integration.calendar_path
    );
    if (match) return match.path;
    return integration.calendar_path;
  }
  // Prefer the calendar marked as the default, otherwise the first VCALENDAR.
  const preferred =
    calendars.find((c) => c.isDefault) ||
    calendars.find((c) => c.isCalendar) ||
    calendars[0];
  return preferred?.path ?? null;
}

/**
 * Extremely small multistatus parser - we only need href + displayname +
 * resourcetype presence so the model can present calendar names.
 */
function parseMultistatus(xml = "") {
  const responses = [];
  const chunks = xml.split(/<(?:D:)?response>/i).slice(1);
  for (const chunk of chunks) {
    const body = chunk.split(/<\/(?:D:)?response>/i)[0];
    const href = pickTag(body, "href");
    if (!href) continue;
    const displayname = pickTag(body, "displayname") || "";
    const resourcetypeBlock =
      body.match(/<resourcetype[^>]*>([\s\S]*?)<\/resourcetype>/i)?.[1] ?? "";
    const isCalendar = /<calendar\b/i.test(resourcetypeBlock);
    const isDefault = /<default\b/i.test(resourcetypeBlock);
    responses.push({
      href,
      path: normalizeHrefPath(href),
      displayname: decodeXml(displayname),
      isCalendar,
      isDefault,
    });
  }
  return responses;
}

function pickTag(xml, tag) {
  const re = new RegExp(
    `<(?:[A-Za-z0-9]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9]+:)?${tag}>`,
    "i"
  );
  const m = xml.match(re);
  if (!m) return null;
  return m[1].trim();
}

function normalizeHrefPath(href = "") {
  try {
    return decodeURIComponent(href).replace(/\/$/, "");
  } catch {
    return href;
  }
}

function joinUrl(base = "", ...parts) {
  const trimmed = base.replace(/\/$/, "");
  return [trimmed, ...parts.filter(Boolean).map((p) => String(p).replace(/^\/+/, ""))].join("/");
}

function decodeXml(s = "") {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function truncate(str = "", max = 200) {
  const clean = String(str).replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

/**
 * Minimal RFC 5545 VEVENT writer. Yandex and other CalDAV servers accept
 * either DTSTART with a TZID parameter (floating local time) or UTC time.
 * We accept an ISO-ish string from the model and normalise it here.
 */
function buildVEvent({
  uid,
  summary,
  description,
  start,
  end,
  location,
  timezone = null,
}) {
  const dtstart = formatIcsDate(start);
  const dtend = formatIcsDate(end || addHours(start, 1));
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AnythingLLM//Workspace Integrations//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDate(new Date(), true)}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escapeText(summary || "Встреча")}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (location) lines.push(`LOCATION:${escapeText(location)}`);
  if (timezone) lines.push(`X-WR-TIMEZONE:${escapeText(timezone)}`);
  lines.push("END:VEVENT", "END:VCALENDAR", "");
  return lines.join("\r\n");
}

function formatIcsDate(value, utc = false) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new Error(`Некорректная дата: ${value}`);
  if (utc) return `${toIcsString(date, true)}Z`;
  return toIcsString(date, false);
}

function toIcsString(d, asUtc) {
  const use = asUtc ? new Date(d.getTime() + d.getTimezoneOffset() * 60_000) : d;
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${use.getFullYear()}${pad(use.getMonth() + 1)}${pad(use.getDate())}` +
    `T${pad(use.getHours())}${pad(use.getMinutes())}${pad(use.getSeconds())}`
  );
}

function addHours(value, hours) {
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(d.getTime())) return new Date();
  d.setHours(d.getHours() + hours);
  return d;
}

function escapeText(value = "") {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

module.exports = {
  discoverCalendars,
  createEvent,
};
