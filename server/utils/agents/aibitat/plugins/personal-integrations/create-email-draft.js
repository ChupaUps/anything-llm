const {
  SCOPES,
  integrationsFor,
  describeAccount,
} = require("./lib.js");

module.exports.CreateEmailDraft = {
  name: "create-email-draft",
  plugin: function () {
    return {
      name: "create-email-draft",
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Create a new draft email in the connected mailbox (Yandex, Mail.ru). " +
            "The message is stored in the «Черновики» folder on the IMAP server " +
            "and is never sent automatically. Use `htmlBody` for formatted content.",
          examples: [
            {
              prompt:
                "Сделай черновик письма Ивану про встречу завтра в 15:00",
              call: JSON.stringify({
                to: "ivan@example.com",
                subject: "Встреча завтра",
                body: "Иван, привет!\n\nПодтверждаю встречу завтра в 15:00.\n\nС уважением",
              }),
            },
            {
              prompt: "Черновик письма с копией менеджеру",
              call: JSON.stringify({
                to: "client@example.com",
                cc: "manager@example.com",
                subject: "Отчёт",
                body: "Во вложении отчёт за квартал.",
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              to: {
                type: "string",
                description: "Recipient address. Multiple addresses separated by comma.",
              },
              subject: { type: "string", description: "Subject line." },
              body: { type: "string", description: "Plain-text body." },
              cc: { type: "string", description: "Optional CC recipients." },
              bcc: { type: "string", description: "Optional BCC recipients." },
              htmlBody: {
                type: "string",
                description: "Optional HTML body (sent as multipart/alternative with body).",
              },
              inReplyTo: {
                type: "string",
                description:
                  "Message-ID this draft replies to (from read-email result) so threading works.",
              },
              account: {
                type: "string",
                description: "Sender address when several mailboxes are attached.",
              },
            },
            required: ["to", "subject", "body"],
            additionalProperties: false,
          },
          handler: async function ({
            to,
            subject,
            body,
            cc = null,
            bcc = null,
            htmlBody = null,
            inReplyTo = null,
            account = null,
          }) {
            try {
              this.super.handlerProps.log("Using the create-email-draft tool.");
              const { integrations, error } = await integrationsFor(
                this.super.handlerProps,
                SCOPES.EMAIL_DRAFT,
                account
              );
              if (error) return `Error: ${error}`;
              const integration = integrations[0];

              if (this.super.requestToolApproval) {
                const approval = await this.super.requestToolApproval({
                  skillName: this.name,
                  payload: { to, subject, cc, bcc, bodyPreview: body.slice(0, 400) },
                  description: `Создать черновик письма «${subject}» к ${to} на ${describeAccount(integration)}`,
                });
                if (!approval.approved) {
                  this.super.introspect(
                    `${this.caller}: User rejected the ${this.name} request.`
                  );
                  return approval.message;
                }
              }

              this.super.introspect(
                `${this.caller}: Создаю черновик на ${describeAccount(integration)}`
              );
              const imap = require("../../../../integrations/imapClient");
              const res = await imap.appendDraft(integration, {
                to,
                subject,
                text: body,
                cc,
                bcc,
                htmlBody,
                inReplyTo,
              });
              if (!res.success) return `Error: ${res.error}`;
              return (
                `Черновик сохранён в папку «${res.draft.folder}» ящика ${integration.account_email}.\n` +
                `Тема: ${res.draft.subject}\nКому: ${res.draft.to}\n` +
                `UID: ${res.draft.uid ?? "(не получен)"}\n` +
                `Письмо НЕ отправлено - пользователь может досмотреть и отправить.`
              );
            } catch (e) {
              this.super.handlerProps.log(`create-email-draft error: ${e.message}`);
              this.super.introspect(`Error: ${e.message}`);
              return `Error creating draft: ${e.message}`;
            }
          },
        });
      },
    };
  },
};
