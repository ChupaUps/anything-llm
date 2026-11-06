/**
 * Thin IMAP wrapper around `imapflow` used by workspace personal-integrations.
 *
 * Only the operations the agent actually needs are exposed: connect-check,
 * recent/list/search, read a single message, and append a draft to the
 * provider's Drafts folder. Everything stays stateless - we open a connection,
 * do the work, close it, so a crashed socket never leaks into another chat.
 */

const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * ImapFlow throws a bare `Error("Command failed")` and hides the meaningful
 * server reply in `error.response` / `error.responseText`. Surface that text so
 * the UI can tell the user *why* the login failed (e.g. "Application password
 * is REQUIRED") instead of an opaque "Command failed".
 */
function imapErrorMessage(error) {
  const detail =
    error?.responseText ||
    (typeof error?.response === "string" ? error.response : null) ||
    error?.message;
  if (!detail) return "Ошибка IMAP";
  // Strip the leading tagged-response prefix like "3 NO " and "[AUTHENTICATIONFAILED] ".
  return String(detail)
    .replace(/^\d+\s+(NO|BAD)\s+/i, "")
    .replace(/^\[[^\]]+\]\s*/i, "")
    .trim() || "Ошибка авторизации IMAP";
}

/**
 * Opens a short-lived connection just to verify the credentials work. Used by
 * the "Test" button on the settings form and by the model when a chat starts
 * to give the user a hint before the first real tool call fails.
 */
async function testImapConnection({
  host = null,
  port = 993,
  user = null,
  password = null,
} = {}) {
  if (!host || !user || !password)
    return { success: false, error: "Не хватает логина или пароля" };
  let client = null;
  try {
    client = new ImapFlow({
      host,
      port: Number(port) || 993,
      secure: true,
      auth: { user, pass: password },
      logger: false,
      socketTimeout: DEFAULT_TIMEOUT_MS,
    });
    await client.connect();
    await client.logout();
    return { success: true, error: null };
  } catch (error) {
    try {
      await client?.close();
    } catch {}
    return { success: false, error: imapErrorMessage(error) };
  }
}

/** Opens a fresh connection to be handed to the caller. */
async function openClient({ host, port = 993, user, password }) {
  const client = new ImapFlow({
    host,
    port: Number(port) || 993,
    secure: true,
    auth: { user, pass: password },
    logger: false,
    socketTimeout: DEFAULT_TIMEOUT_MS,
  });
  await client.connect();
  return client;
}

async function withClient(integration, fn) {
  const client = await openClient({
    host: integration.imap_host,
    port: integration.imap_port,
    user: integration.auth_user,
    password: integration.password,
  });
  try {
    return await fn(client);
  } finally {
    try {
      await client.logout();
    } catch {
      try {
        await client.close();
      } catch {}
    }
  }
}

/**
 * Picks the mailbox path to work on. Callers can pass an explicit path (e.g.
 * "INBOX/Sent") and we validate it against the folder list; otherwise INBOX is
 * used. Provider-specific mailboxes like "Черновики" for Yandex are resolved
 * case-insensitively to accommodate UI differences.
 */
async function resolveMailboxPath(client, requested = null) {
  if (!requested) return "INBOX";
  const lowercase = String(requested).toLowerCase();
  if (lowercase === "inbox") return "INBOX";
  const list = await client.list();
  const match = list.find(
    (m) => m.path === requested || m.path.toLowerCase() === lowercase
  );
  return match?.path ?? requested;
}

/**
 * Lists recent messages (or search results). `query` supports the same shape
 * imapflow accepts: { subject, from, to, text, since, before }. We return a
 * trimmed envelope so the model can pick what to open next without blowing
 * the context.
 */
async function listMessages(integration, { folder = "INBOX", limit = 10, query = null } = {}) {
  return withClient(integration, async (client) => {
    const lock = await client.getMailboxLock(await resolveMailboxPath(client, folder));
    try {
      let uids;
      if (query && Object.keys(query).length) {
        uids = await client.search(query, { uid: true });
      } else {
        const statuses = await client.mailboxOpen(
          await resolveMailboxPath(client, folder)
        );
        const total = statuses.messages?.exists ?? 0;
        const from = Math.max(1, total - Math.max(0, Number(limit) || 10) + 1);
        uids = await client.search(
          { uid: { from, to: total } },
          { uid: true }
        );
      }
      const tail = uids.slice(-Math.max(1, Number(limit) || 10)).reverse();

      const results = [];
      for (const uid of tail) {
        const msg = await client.fetchOne(
          uid,
          { envelope: true, flags: true, "body[header.fields (date)]": true },
          { uid: true }
        );
        if (!msg) continue;
        results.push({
          uid,
          date: msg.source || null,
          flags: msg.flags || [],
          from: formatAddress(msg.envelope?.from),
          to: formatAddress(msg.envelope?.to),
          cc: formatAddress(msg.envelope?.cc),
          subject: msg.envelope?.subject || "(без темы)",
          messageId: msg.envelope["message-id"] || null,
        });
      }
      return { success: true, messages: results, error: null };
    } finally {
      lock.release();
    }
  });
}

/** Reads a single message and returns headers + text body (attachments listed
 * but not streamed - the agent can ask for them explicitly later). */
async function readMessage(integration, { folder = "INBOX", uid = null } = {}) {
  if (!uid) return { success: false, error: "Не указан UID письма" };
  return withClient(integration, async (client) => {
    const lock = await client.getMailboxLock(
      await resolveMailboxPath(client, folder)
    );
    try {
      const msg = await client.fetchOne(
        Number(uid),
        { source: true },
        { uid: true }
      );
      if (!msg?.source)
        return { success: false, error: "Письмо не найдено" };
      const parsed = await simpleParser(msg.source);
      return {
        success: true,
        error: null,
        message: {
          uid: Number(uid),
          date: parsed.date ? parsed.date.toISOString() : null,
          from: formatAddress(parsed.from),
          to: formatAddress(parsed.to),
          cc: formatAddress(parsed.cc),
          subject: parsed.subject || "(без темы)",
          messageId: parsed.messageId || null,
          inReplyTo: parsed.inReplyTo || null,
          text: (parsed.text || "").trim(),
          html: parsed.html ? String(parsed.html).slice(0, 20_000) : null,
          attachments: (parsed.attachments || []).map((a) => ({
            filename: a.filename,
            contentType: a.contentType,
            size: a.size,
          })),
        },
      };
    } finally {
      lock.release();
    }
  });
}

/**
 * Appends a new message to the provider's Drafts mailbox. Falls back to the
 * English "Drafts" name if the localised folder is missing. Uses the \Draft
 * flag so the mailbox UI shows it as an unfinished message.
 */
async function appendDraft(
  integration,
  { to, subject, text, cc = null, bcc = null, htmlBody = null, inReplyTo = null } = {}
) {
  if (!to || !subject)
    return { success: false, error: "Нужны получатель и тема" };

  const raw = buildRawMessage({
    from: integration.account_email,
    to,
    cc,
    bcc,
    subject,
    text,
    htmlBody,
    inReplyTo,
  });

  const candidates = draftFolderCandidates(integration);
  return withClient(integration, async (client) => {
    const mailboxes = await client.list();
    const pick =
      candidates.find((c) => mailboxes.some((m) => m.path === c)) ||
      candidates.find((c) =>
        mailboxes.some((m) => m.path.toLowerCase() === c.toLowerCase())
      );
    if (!pick)
      return {
        success: false,
        error: "Не нашли папку «Черновики» на почтовом сервере",
      };

    const lock = await client.getMailboxLock(pick);
    try {
      const res = await client.append(pick, Buffer.from(raw, "utf-8"), {
        flags: ["\\Draft", "\\Seen"],
      });
      return {
        success: true,
        error: null,
        draft: {
          uid: res?.uid ?? null,
          folder: pick,
          to,
          subject,
        },
      };
    } finally {
      lock.release();
    }
  });
}

/** Yandex & Mail.ru name the drafts folder in Russian by default; a fresh
 * account sometimes only has the English name. Order matters: prefer the
 * provider's canonical path, then the anglicised one, then a common suffix. */
function draftFolderCandidates(integration) {
  const fromProvider = integration.provider === "yandex" ? "Черновики" : "Черновики";
  return [fromProvider, "Drafts", "[Gmail]/Drafts"];
}

/** Minimal RFC 5322 message builder - enough for text + optional HTML body,
 * no attachments, proper multi-part when both variants are present. */
function buildRawMessage({
  from,
  to,
  cc,
  bcc,
  subject,
  text,
  htmlBody,
  inReplyTo,
}) {
  const boundary = `----=_AL_${Date.now().toString(36)}`;
  const date = new Date().toUTCString();
  const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@anythingllm.local>`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: ${foldHeader(subject)}`,
    `Date: ${date}`,
    `Message-ID: ${messageId}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    `MIME-Version: 1.0`,
  ].filter(Boolean);

  if (!htmlBody) {
    return [
      ...headers,
      `Content-Type: text/plain; charset="UTF-8"`,
      `Content-Transfer-Encoding: 8bit`,
      "",
      text || "",
      "",
    ].join("\r\n");
  }

  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 8bit`,
    "",
    text || "",
    "",
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 8bit`,
    "",
    htmlBody,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function foldHeader(value = "") {
  // Keep long subjects from breaking strict servers; a simple space-based fold
  // is RFC-compliant enough for our purposes.
  const clean = String(value).replace(/[\r\n]+/g, " ");
  if (clean.length <= 76) return clean;
  return clean.slice(0, 76) + "\r\n " + clean.slice(76);
}

function formatAddress(field) {
  if (!field) return "";
  const one = (a) => (a?.address ? `${a.name ? a.name + " " : ""}<${a.address}>` : a?.text || "");
  if (Array.isArray(field)) return field.map(one).join(", ");
  if (field.value && Array.isArray(field.value)) return field.value.map(one).join(", ");
  return one(field);
}

module.exports = {
  testImapConnection,
  listMessages,
  readMessage,
  appendDraft,
};
