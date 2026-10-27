const codeInterpreter = require("./lib.js");

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

module.exports.CodeUploadFile = {
  name: "code-upload-file",
  plugin: function () {
    return {
      name: "code-upload-file",
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Copy a file into the code interpreter sandbox so Python can read it, or create a text file there from raw content. " +
            "Use `path` for files that already exist in your allowed directories (for example a CSV the user uploaded and that you found with filesystem-search-files), " +
            "or `content` to write text/CSV/JSON directly. The file lands in the sandbox working directory under `filename` (defaults to the source file name) " +
            "and stays there for later code-run calls.",
          examples: [
            {
              prompt: "Copy /storage/anythingllm-fs/sales.csv into the sandbox",
              call: JSON.stringify({ path: "sales.csv" }),
            },
            {
              prompt: "Create a small dataset for the calculation",
              call: JSON.stringify({
                filename: "values.csv",
                content: "month,revenue\nJan,120\nFeb,135\nMar,158\n",
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              path: {
                type: "string",
                description:
                  "Path of an existing file inside the allowed directories to copy into the sandbox.",
              },
              filename: {
                type: "string",
                description:
                  "Target file name inside the sandbox. Defaults to the source file name.",
              },
              content: {
                type: "string",
                description:
                  "Raw text content to write into the target file. Use this instead of `path` to create data inline.",
              },
            },
            additionalProperties: false,
          },
          handler: async function ({ path: sourcePath, filename, content }) {
            try {
              if (!sourcePath && content === undefined)
                return "Error: provide either `path` or `content`.";

              let buffer;
              let name = filename;

              if (content !== undefined) {
                buffer = Buffer.from(String(content), "utf8");
              } else {
                this.super.introspect(
                  `${this.caller}: Copying ${sourcePath} into the sandbox`
                );
                const source =
                  await codeInterpreter.readAllowedFile(sourcePath);
                buffer = source.buffer;
                if (!name) name = source.name;
              }

              if (buffer.length === 0)
                return "Error: nothing to upload (empty file).";
              if (buffer.length > MAX_UPLOAD_BYTES)
                return `Error: file is too large (${(buffer.length / (1024 * 1024)).toFixed(1)}MB, limit 25MB). Split it or extract only the columns you need.`;

              const safeName = codeInterpreter.normalizeDisplayName(
                name || "upload.txt"
              );
              await codeInterpreter.writeFile(this.super, {
                name: safeName,
                buffer,
              });

              this.super.introspect(
                `${this.caller}: Uploaded ${safeName} (${(buffer.length / 1024).toFixed(1)}KB) to the sandbox`
              );

              return `Uploaded "${safeName}" (${(buffer.length / 1024).toFixed(1)}KB) into the sandbox working directory. Read it in code-run, e.g. pd.read_csv("${safeName}").`;
            } catch (error) {
              this.super.handlerProps.log(
                `code-upload-file error: ${error.message}`
              );
              this.super.introspect(`Error: ${error.message}`);
              return `Error uploading file: ${error.message}`;
            }
          },
        });
      },
    };
  },
};

module.exports.MAX_UPLOAD_BYTES = MAX_UPLOAD_BYTES;
