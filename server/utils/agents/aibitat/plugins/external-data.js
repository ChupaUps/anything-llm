const {
  WorkspaceDataConnector,
} = require("../../../../models/workspaceDataConnector");
const {
  fetchConnectorData,
  renderSchema,
  compactPayload,
} = require("../../../workspaces/dataConnectorClient");

const MAX_BATCH = 5;

/**
 * The address of a Bitrix24 webhook contains the token, so the model only sees
 * the portal and the method part of it.
 * @param {string} url
 * @returns {string}
 */
function displayUrl(url = "") {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(
      /^(.*\/rest\/[^/]+)\/[^/]+\//i,
      "$1/***/"
    );
    return `${parsed.origin}${pathname}`;
  } catch {
    return String(url || "");
  }
}

/**
 * Tells the model how this particular system is called.
 * @param {object} connector
 * @returns {string}
 */
function callHint(connector = {}) {
  if (connector.provider === "bitrix24") {
    const variant =
      connector.variant === "oauth" ? "OAuth application" : "inbound webhook";
    return `   Call: path = REST method without the address, for example "crm.deal.list"; query = Bitrix24 filters, for example {"filter[STAGE_ID]":"NEW","select[]":"ID"}. Variant: ${variant}.`;
  }
  if (connector.provider === "1c")
    return `   Call: path = OData segment after the address (optional); query = 1C parameters, for example {"$top":"20","$filter":"..."}. $format=json is added automatically.`;
  return `   Call: path = relative path after the address (optional); query = any GET parameters.`;
}

/**
 * Live data from external business systems (1C, Bitrix24, any REST API) that the
 * workspace owner connected in the workspace settings. The tool is attached
 * automatically whenever a workspace has at least one enabled connector, so
 * users do not need an admin to toggle a skill for them.
 */
const externalData = {
  name: "external-data",
  startupConfig: {
    params: {},
  },
  plugin: function () {
    return {
      name: this.name,
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Fetch live data from the external systems connected to this workspace (1C, Bitrix24 or any other REST API). Use `list` to see which systems are connected and which fields they return, then `fetch` to pull the current records. 1C is addressed by a relative OData path, Bitrix24 by a REST method name such as `crm.deal.list`. Several connections can be read in one call through `connectors` - use it when an answer needs data from both 1C and Bitrix24. The data is real and up-to-date - always call this tool instead of guessing values.",
          examples: [
            {
              prompt: "Сколько у нас открытых сделок в Битрикс24?",
              call: JSON.stringify({ action: "list" }),
            },
            {
              prompt: "Покажи новые сделки из Битрикс24",
              call: JSON.stringify({
                action: "fetch",
                connector: "Битрикс24 · Сделки",
                path: "crm.deal.list",
                query: { "filter[STAGE_ID]": "NEW" },
              }),
            },
            {
              prompt: "Сверь сделки из Битрикс24 с оплатами в 1С",
              call: JSON.stringify({
                action: "fetch",
                connectors: ["Битрикс24 · Сделки", "1С · Оплаты"],
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: ["list", "fetch"],
                description:
                  "`list` returns the connected systems, their purpose and response fields. `fetch` performs GET requests and returns the current data.",
              },
              connector: {
                type: "string",
                description:
                  "Connector name returned by `list`. A provider name is also accepted when only one connection of that system exists (`1C`, `Bitrix24`). Required for `fetch` unless `connectors` is used.",
              },
              connectors: {
                type: "array",
                items: { type: "string" },
                description:
                  'Several connectors to read in one call, for example ["1С · Оплаты", "Битрикс24 · Сделки"]. Use it to combine systems in a single answer. Path and query are ignored in this mode.',
              },
              path: {
                type: "string",
                description:
                  "Optional, single connector only. Bitrix24: REST method, for example 'crm.deal.list'. 1C and other APIs: relative path appended to the connector address.",
              },
              query: {
                type: "object",
                description:
                  'Optional GET parameters, for example {"$top":"10","$filter":"..."} for 1C or {"filter[STAGE_ID]":"NEW"} for Bitrix24.',
                additionalProperties: true,
              },
            },
            required: ["action"],
            additionalProperties: false,
          },
          handler: async function ({
            action = "list",
            connector = "",
            connectors: connectorList = [],
            path = null,
            query = null,
          }) {
            try {
              const invocation = this.super.handlerProps?.invocation ?? {};
              const workspaceId =
                invocation?.workspace?.id ?? invocation?.workspace_id ?? null;
              if (!workspaceId) return "No workspace context is available.";

              const available =
                await WorkspaceDataConnector.enabled(workspaceId);
              if (available.length === 0)
                return "No external systems (1C, Bitrix24) are connected to this workspace yet. The user can add one in the workspace settings in the 'Data & API' tab.";

              if (action === "list") {
                this.super.introspect?.(
                  `${this.caller}: Listing ${available.length} connected external system(s).`
                );
                const lines = available.map((entry, index) => {
                  const schema = renderSchema(entry.response_schema);
                  const variant = entry.variant ? `, ${entry.variant}` : "";
                  return [
                    `${index + 1}. "${entry.name}" (${entry.provider}${variant})${entry.description ? ` - ${entry.description}` : ""}`,
                    `   Address: ${displayUrl(entry.url)}`,
                    entry.default_path
                      ? `   Default path: ${entry.default_path}`
                      : "",
                    callHint(entry),
                    schema ? `   Response fields:\n${schema}` : "",
                  ]
                    .filter(Boolean)
                    .join("\n");
                });
                return [
                  `Connected external systems (${available.length}):`,
                  "",
                  lines.join("\n\n"),
                  "",
                  "Read several systems at once with `connectors` to combine 1C and Bitrix24 data in one answer.",
                ].join("\n");
              }

              // The model may name one connector or ask for several at once.
              const requested = (
                Array.isArray(connectorList) ? connectorList : []
              )
                .map((entry) => String(entry || "").trim())
                .filter(Boolean);
              if (requested.length === 0 && String(connector || "").trim())
                requested.push(String(connector).trim());

              if (requested.length === 0)
                return `Specify the connection to use: ${available
                  .map((entry) => `"${entry.name}"`)
                  .join(", ")}.`;

              const selected = [];
              const problems = [];
              for (const name of requested.slice(0, MAX_BATCH)) {
                const { connector: target, error } =
                  WorkspaceDataConnector.resolve(available, name);
                if (!target) {
                  problems.push(error);
                  continue;
                }
                if (!selected.some((entry) => entry.id === target.id))
                  selected.push(target);
              }

              if (selected.length === 0) return problems.join(" ");

              const sections = [];
              for (const target of selected) {
                // A path/query pair usually belongs to a single system, so in
                // batch mode each connection is read with its own defaults.
                const opts =
                  selected.length === 1
                    ? { path, query }
                    : { path: null, query: null };

                const result = await fetchConnectorData(
                  WorkspaceDataConnector.withSecret(target),
                  opts
                );

                if (!result.ok) {
                  this.super.handlerProps.log?.(
                    `external-data fetch failed for "${target.name}": ${result.error}`
                  );
                  sections.push(
                    `Request to "${target.name}" failed: ${result.error}.`
                  );
                  continue;
                }

                this.super.introspect?.(
                  `${this.caller}: Fetched live data from "${target.name}" (HTTP ${result.status}).`
                );

                const schema = renderSchema(target.response_schema);
                sections.push(
                  [
                    `Live data from "${target.name}" (${target.provider}), HTTP ${result.status}, ${result.durationMs} ms.`,
                    schema ? `Known fields:\n${schema}` : "",
                    `Data (JSON, arrays are limited to the first items - narrow them with query parameters if needed):\n${compactPayload(
                      result.data
                    )}`,
                  ]
                    .filter(Boolean)
                    .join("\n\n")
                );
              }

              const output = sections.join("\n\n---\n\n");
              if (!problems.length) return output;
              return `${output}\n\n${problems.join(" ")}`;
            } catch (error) {
              this.super.handlerProps.log?.(
                `external-data raised an error. ${error.message}`
              );
              return `An error was raised while requesting the external system. ${error.message}`;
            }
          },
        });
      },
    };
  },
};

module.exports = { externalData };
