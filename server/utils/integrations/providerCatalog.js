/**
 * Catalog of email / calendar providers the workspace integrations support.
 *
 * Every entry declares the fixed IMAP/SMTP/CalDAV hosts, which scopes the
 * provider is capable of and where the user has to generate the app password.
 * Adding Google/Microsoft here is deliberately not enough for OAuth - those
 * providers require a full OAuth flow and will be wired separately.
 */

const SCOPES = {
  EMAIL_READ: "email:read",
  EMAIL_DRAFT: "email:draft",
  CALENDAR_CREATE: "calendar:create",
};

const PROVIDERS = {
  yandex: {
    id: "yandex",
    label: "Яндекс 360",
    labelEn: "Yandex 360",
    domains: ["yandex.ru", "yandex.com", "yandex.by", "yandex.kz", "ya.ru"],
    imap: { host: "imap.yandex.ru", port: 993, tls: true },
    smtp: { host: "smtp.yandex.ru", port: 465, tls: true },
    caldav: { baseUrl: "https://realbox.me/dav/" },
    draftsFolder: "Черновики",
    draftsFolderEnglish: "Drafts",
    capabilities: [SCOPES.EMAIL_READ, SCOPES.EMAIL_DRAFT, SCOPES.CALENDAR_CREATE],
    passwordHelpUrl:
      "https://id.yandex.ru/security/apppassword",
    passwordHelpUrlEn:
      "https://id.yandex.com/troubleshoot/app-password",
  },
  mail_ru: {
    id: "mail_ru",
    label: "Mail.ru",
    labelEn: "Mail.ru",
    domains: ["mail.ru", "inbox.ru", "list.ru", "bk.ru"],
    imap: { host: "imap.mail.ru", port: 993, tls: true },
    smtp: { host: "smtp.mail.ru", port: 465, tls: true },
    caldav: null,
    draftsFolder: "Черновики",
    draftsFolderEnglish: "Drafts",
    capabilities: [SCOPES.EMAIL_READ, SCOPES.EMAIL_DRAFT],
    passwordHelpUrl:
      "https://account.mail.ru/settings?fields=other#app-passwords",
    passwordHelpUrlEn:
      "https://account.mail.ru/settings?fields=other#app-passwords",
  },
};

function providerById(id = null) {
  if (!id) return null;
  return PROVIDERS[id] ?? null;
}

/** Best-effort provider guess from the address domain - used to pre-select the
 * provider in the UI so a first-time user does not need to think about it. */
function guessProviderFromEmail(email = "") {
  const domain = String(email).split("@")[1]?.toLowerCase() ?? "";
  for (const provider of Object.values(PROVIDERS)) {
    if (provider.domains.includes(domain)) return provider.id;
  }
  return null;
}

module.exports = {
  SCOPES,
  PROVIDERS,
  providerById,
  guessProviderFromEmail,
};
