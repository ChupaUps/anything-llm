const codeInterpreter = require("./lib.js");

const MAX_RESULT_CHARS = 24_000;
const MAX_STREAM_CHARS = 14_000;
const MAX_CODE_CHARS = 100_000;

function truncate(text = "", limit = MAX_STREAM_CHARS) {
  if (typeof text !== "string") return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n... [truncated ${text.length - limit} characters]`;
}

function formatSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

module.exports.CodeRun = {
  name: "code-run",
  plugin: function () {
    return {
      name: "code-run",
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Execute Python 3.12 code in an isolated sandbox and return stdout, stderr and any files it creates. " +
            "Use this whenever the task needs real computation instead of mental math: statistics, financial or unit calculations, simulations, parsing/joining large CSV or Excel files, data cleaning, or charts. " +
            "Available libraries: numpy, pandas, scipy, matplotlib, openpyxl and the Python standard library. " +
            "The sandbox has NO internet access and cannot install packages. " +
            "Files written to the working directory persist between code-run calls in this chat - reuse them instead of recomputing. " +
            "Only what you print() is visible to you, so print intermediate values and shapes explicitly. " +
            "For charts, call plt.savefig('chart.png', dpi=150, bbox_inches='tight'); plt.show() also saves to figure-<n>.png. " +
            "Created files are handed to the user as downloads and generated images are attached back to you for review. " +
            "To analyse a file the user provided, upload it first with code-upload-file.",
          examples: [
            {
              prompt:
                "What is the compound growth of 12500 at 7.5% over 12 years?",
              call: JSON.stringify({
                code: "print(12500 * (1.075 ** 12))",
              }),
            },
            {
              prompt:
                "Read sales.csv from the sandbox and summarise revenue by region",
              call: JSON.stringify({
                code: "import pandas as pd\ndf = pd.read_csv('sales.csv')\nprint(df.groupby('region')['revenue'].sum().sort_values(ascending=False))",
              }),
            },
            {
              prompt: "Plot monthly revenue from revenue.csv",
              call: JSON.stringify({
                code: "import pandas as pd\nimport matplotlib.pyplot as plt\ndf = pd.read_csv('revenue.csv')\nax = df.plot(x='month', y='revenue', marker='o')\nax.set_title('Monthly revenue')\nplt.savefig('revenue.png', dpi=150, bbox_inches='tight')",
                timeout_ms: 60000,
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              code: {
                type: "string",
                description:
                  "Complete, self-contained Python code to execute. Include imports. Print the values you need - stdout is your only window into the run.",
              },
              timeout_ms: {
                type: "number",
                description:
                  "Execution timeout in milliseconds. Defaults to 30000, maximum 180000. Raise it for heavy pandas/scipy work.",
              },
            },
            required: ["code"],
            additionalProperties: false,
          },
          handler: async function ({ code = "", timeout_ms }) {
            try {
              if (!code.trim()) return "Error: `code` is required.";
              if (code.length > MAX_CODE_CHARS)
                return `Error: code is too long (${code.length} characters, limit ${MAX_CODE_CHARS}).`;

              const timeoutMs = codeInterpreter.clampTimeout(timeout_ms);

              if (this.super.requestToolApproval) {
                const approval = await this.super.requestToolApproval({
                  skillName: this.name,
                  payload: {
                    code: truncate(code, 4_000),
                    timeoutMs,
                  },
                  description: "Run Python code in the isolated sandbox",
                });
                if (!approval.approved) {
                  this.super.introspect(
                    `${this.caller}: code execution denied - ${approval.message || "rejected by user"}`
                  );
                  return `Code execution was not approved: ${approval.message || "rejected by user"}. Ask the user how to proceed.`;
                }
              }

              this.super.introspect(
                `${this.caller}: Running Python in the code interpreter`
              );

              const result = await codeInterpreter.execute(this.super, {
                code,
                timeoutMs,
              });
              const published = await codeInterpreter.publishArtifacts(
                this.super,
                result.artifacts || []
              );

              const sections = [
                `exit code: ${result.exitCode}${
                  result.timedOut
                    ? ` (timed out after ${result.timeoutMs}ms)`
                    : ""
                } | ${result.durationMs}ms`,
              ];

              const stdout = truncate(result.stdout || "").trim();
              sections.push(
                `--- stdout ---\n${stdout || "(no output - did you forget to print()?)"}`
              );

              const stderr = truncate(result.stderr || "").trim();
              if (stderr) sections.push(`--- stderr ---\n${stderr}`);

              if (published.length > 0) {
                sections.push(
                  `--- files created ---\n${published
                    .map((file) => `${file.name} (${formatSize(file.size)})`)
                    .join(
                      "\n"
                    )}\nThese files are attached to the chat for the user to download${
                    published.some((file) =>
                      /\.(png|jpe?g|gif|webp)$/i.test(file.name)
                    )
                      ? " and images were attached for you to view"
                      : ""
                  }.`
                );
              } else if ((result.artifacts || []).length > 0) {
                sections.push(
                  `--- files created (not persisted) ---\n${(
                    result.artifacts || []
                  )
                    .map((file) => `${file.name} (${formatSize(file.size)})`)
                    .join("\n")}`
                );
              }

              if (result.timedOut) {
                sections.push(
                  "The process was killed by the timeout. Reduce the workload, narrow the data, or raise timeout_ms (max 180000)."
                );
              } else if (result.exitCode !== 0 && !stderr) {
                sections.push(
                  "The process failed without stderr output - check the exit code and add explicit prints."
                );
              }

              this.super.introspect(
                `${this.caller}: Code interpreter finished with exit code ${result.exitCode}`
              );

              return truncate(sections.join("\n\n"), MAX_RESULT_CHARS);
            } catch (error) {
              this.super.handlerProps.log(`code-run error: ${error.message}`);
              this.super.introspect(`Error: ${error.message}`);
              return `Error running code: ${error.message}`;
            }
          },
        });
      },
    };
  },
};
