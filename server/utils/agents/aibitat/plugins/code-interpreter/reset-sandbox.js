const codeInterpreter = require("./lib.js");

module.exports.CodeResetSandbox = {
  name: "code-reset-sandbox",
  plugin: function () {
    return {
      name: "code-reset-sandbox",
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Delete every file in this conversation's code interpreter sandbox and start from a clean working directory. " +
            "Use it when previous runs left broken state or stale data behind. Files already delivered to the user are untouched.",
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          handler: async function () {
            try {
              this.super.introspect(`${this.caller}: Resetting the sandbox`);
              await codeInterpreter.reset(this.super);
              return "Sandbox reset. The working directory is empty again.";
            } catch (error) {
              this.super.handlerProps.log(
                `code-reset-sandbox error: ${error.message}`
              );
              this.super.introspect(`Error: ${error.message}`);
              return `Error resetting sandbox: ${error.message}`;
            }
          },
        });
      },
    };
  },
};
