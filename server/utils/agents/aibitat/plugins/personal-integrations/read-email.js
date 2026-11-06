const {
  SCOPES,
  integrationsFor,
  describeAccount,
} = require("./lib.js");

module.exports.ReadEmail = {
  name: "read-email",
  plugin: function () {
    return {
      name: "read-email",
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Read recent emails or search a connected mailbox. Two modes: " +
            "(a) list mode - returns the newest N messages of the folder; " +
            "(b) read mode - returns the full body of one message by uid. " +
            "Use `list` first to see uids, then `read` with a uid to fetch the body. " +
            "If the workspace has several mailboxes connected, pass `account` to disambiguate.",
          examples: [
            {
              prompt: "Покажи последние письма во входящих",
              call: JSON.stringify({ mode: "list", folder: "INBOX", limit: 10 }),
            },
            {
              prompt: "Найди письма от Ivan Petrov про договор",
              call: JSON.stringify({
                mode: "list",
                query: { from: "ivan", subject: "договор" },
                limit: 5,
              }),
            },
            {
              prompt: "Прочитай письмо 1234 полностью",
              call: JSON.stringify({ mode: "read", folder: "INBOX", uid: 1234 }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              mode: {
                type: "string",
                enum: ["list", "read"],
                description: "list = inbox overview; read = full body of one message.",
              },
              folder: {
                type: "string",
                description:
                  "Mailbox path. Defaults to INBOX. Yandex/Mail.ru use Russian names " +
                  "like «Отправленные», «Черновики» - pass them verbatim.",
              },
              limit: {
                type: "number",
                description: "Max messages for list mode. Default 10, capped at 25.",
              },
              query: {
                type: "object",
                description:
                  "Optional IMAP search for list mode. Supported keys: from, to, " +
                  "subject, text, since (YYYY-MM-DD), before (YYYY-MM-DD).",
                additionalProperties: true,
              },
              uid: {
                type: "number",
                description: "Message uid for read mode (from a previous list call).",
              },
              account: {
                type: "string",
                description:
                  "Email address of the connected mailbox when several are attached.",
              },
            },
            required: ["mode"],
            additionalProperties: false,
          },
          handler: async function ({
            mode,
            folder = "INBOX",
            limit = 10,
            query = null,
            uid = null,
            account = null,
          }) {
            try {
              this.super.handlerProps.log("Using the read-email tool.");
              const { integrations, error } = await integrationsFor(
                this.super.handlerProps,
                SCOPES.EMAIL_READ,
                account
              );
              if (error) return `Error: ${error}`;
              const integration = integrations[0];
              this.super.introspect(
                `${this.caller}: Читаю почту через ${describeAccount(integration)}`
              );

              const imap = require("../../../../integrations/imapClient");
              if (mode === "read") {
                if (!uid) return "Error: uid is required for read mode.";
                const res = await imap.readMessage(integration, { folder, uid });
                if (!res.success) return `Error: ${res.error}`;
                return JSON.stringify(res.message, null, 2);
              }

              const res = await imap.listMessages(integration, {
                folder,
                limit: Math.min(25, Math.max(1, Number(limit) || 10)),
                query: query && typeof query === "object" ? query : null,
              });
              if (!res.success) return `Error: ${res.error}`;
              return JSON.stringify(
                { account: integration.account_email, messages: res.messages },
                null,
                2
              );
            } catch (e) {
              this.super.handlerProps.log(`read-email error: ${e.message}`);
              this.super.introspect(`Error: ${e.message}`);
              return `Error reading email: ${e.message}`;
            }
          },
        });
      },
    };
  },
};
