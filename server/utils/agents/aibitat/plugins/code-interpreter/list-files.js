const codeInterpreter = require("./lib.js");

module.exports.CodeListFiles = {
  name: "code-list-files",
  plugin: function () {
    return {
      name: "code-list-files",
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "List the files currently stored in the code interpreter sandbox for this conversation. " +
            "Use it before re-uploading data or when you are unsure whether a previous cell already produced a file.",
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          handler: async function () {
            try {
              const { files = [] } = await codeInterpreter.listFiles(
                this.super
              );
              if (files.length === 0)
                return "The sandbox is empty. Upload a file with code-upload-file or create one with code-run first.";

              return [
                `Files in the sandbox (${files.length}):`,
                ...files.map(
                  (file) =>
                    `- ${file.name} (${(file.size / 1024).toFixed(1)}KB${
                      file.extension ? `, .${file.extension}` : ""
                    })`
                ),
              ].join("\n");
            } catch (error) {
              this.super.handlerProps.log(
                `code-list-files error: ${error.message}`
              );
              this.super.introspect(`Error: ${error.message}`);
              return `Error listing sandbox files: ${error.message}`;
            }
          },
        });
      },
    };
  },
};
