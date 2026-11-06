const {
  SCOPES,
  integrationsFor,
  describeAccount,
} = require("./lib.js");

module.exports.CreateCalendarEvent = {
  name: "create-calendar-event",
  plugin: function () {
    return {
      name: "create-calendar-event",
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Create a new event in the connected calendar (currently Yandex 360 via CalDAV). " +
            "Times must be ISO 8601 (e.g. 2026-11-05T15:00:00+03:00). End is optional - " +
            "defaults to start + 1 hour. The event is written straight into the calendar.",
          examples: [
            {
              prompt: "Поставь встречу с Иваном 5 ноября в 15:00 на час",
              call: JSON.stringify({
                summary: "Встреча с Иваном",
                start: "2026-11-05T15:00:00",
                end: "2026-11-05T16:00:00",
              }),
            },
            {
              prompt: "Создай событие «Созвон с командой» на завтра в 10 утра, 30 минут",
              call: JSON.stringify({
                summary: "Созвон с командой",
                start: "2026-11-03T10:00:00",
                end: "2026-11-03T10:30:00",
                description: "Обсуждаем статус проекта.",
                location: "Google Meet",
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              summary: { type: "string", description: "Event title." },
              start: {
                type: "string",
                description: "Start time in ISO 8601 (with or without offset).",
              },
              end: {
                type: "string",
                description: "End time. Optional - defaults to start + 1h.",
              },
              description: { type: "string", description: "Long description." },
              location: { type: "string", description: "Free-form location." },
              timezone: {
                type: "string",
                description: "IANA timezone for display (e.g. Europe/Moscow).",
              },
              account: {
                type: "string",
                description:
                  "Email address of the calendar owner if several are attached.",
              },
            },
            required: ["summary", "start"],
            additionalProperties: false,
          },
          handler: async function ({
            summary,
            start,
            end = null,
            description = null,
            location = null,
            timezone = null,
            account = null,
          }) {
            try {
              this.super.handlerProps.log("Using the create-calendar-event tool.");
              const { integrations, error } = await integrationsFor(
                this.super.handlerProps,
                SCOPES.CALENDAR_CREATE,
                account
              );
              if (error) return `Error: ${error}`;
              const integration = integrations.find((i) => i.caldav_url) ?? integrations[0];
              if (!integration.caldav_url)
                return "Error: у подключённого ящика нет CalDAV-совместимого календаря.";

              if (this.super.requestToolApproval) {
                const approval = await this.super.requestToolApproval({
                  skillName: this.name,
                  payload: { summary, start, end, location },
                  description: `Создать событие «${summary}» на ${start} в календаре ${describeAccount(integration)}`,
                });
                if (!approval.approved) {
                  this.super.introspect(
                    `${this.caller}: User rejected the ${this.name} request.`
                  );
                  return approval.message;
                }
              }

              this.super.introspect(
                `${this.caller}: Создаю событие на ${describeAccount(integration)}`
              );
              const caldav = require("../../../../integrations/caldavClient");
              const res = await caldav.createEvent(integration, {
                summary,
                start,
                end,
                description,
                location,
                timezone,
              });
              if (!res.success) return `Error: ${res.error}`;
              return (
                `Событие создано.\n` +
                `Название: ${res.event.summary}\n` +
                `Начало: ${res.event.start}\n` +
                (res.event.end ? `Окончание: ${res.event.end}\n` : "") +
                `Календарь: ${res.event.calendar}\n` +
                `UID: ${res.event.uid}`
              );
            } catch (e) {
              this.super.handlerProps.log(`create-calendar-event error: ${e.message}`);
              this.super.introspect(`Error: ${e.message}`);
              return `Error creating event: ${e.message}`;
            }
          },
        });
      },
    };
  },
};
