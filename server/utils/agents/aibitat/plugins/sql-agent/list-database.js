module.exports.SqlAgentListDatabase = {
  name: "sql-list-databases",
  plugin: function () {
    const {
      listSQLConnections,
      workspaceIdFrom,
      NO_CONNECTIONS_MESSAGE,
    } = require("./SQLConnectors");
    return {
      name: "sql-list-databases",
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "List all SQL databases connected to this workspace via `list_databases`. Returns a unique string identifier `database_id` that can be used for future calls.",
          examples: [
            {
              prompt: "What databases can you access?",
              call: JSON.stringify({}),
            },
            {
              prompt: "What databases can you tell me about?",
              call: JSON.stringify({}),
            },
            {
              prompt: "Is there a database named erp-logs you can access?",
              call: JSON.stringify({}),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          handler: async function () {
            this.super.handlerProps.log(`Using the sql-list-databases tool.`);
            this.super.introspect(
              `${this.caller}: Checking what are the available databases.`
            );

            const connections = (
              await listSQLConnections(workspaceIdFrom(this.super.handlerProps))
            ).map((conn) => {
              const { connectionString: _connectionString, ...rest } = conn;
              return rest;
            });
            if (connections.length === 0) return NO_CONNECTIONS_MESSAGE;
            return JSON.stringify(connections);
          },
        });
      },
    };
  },
};
