const { CodeRun } = require("./run-code.js");
const { CodeUploadFile } = require("./upload-file.js");
const { CodeListFiles } = require("./list-files.js");
const { CodeResetSandbox } = require("./reset-sandbox.js");

/**
 * Code interpreter skill.
 *
 * Python cells run in a separate, network-less container (`code-interpreter`
 * service) so agent-generated code can do real computation without touching the
 * app process, its storage or its credentials. Sub-tools are individually
 * toggleable via the `disabled_code_interpreter_skills` system preference.
 */
const codeInterpreterAgent = {
  name: "code-interpreter",
  startupConfig: {
    params: {},
  },
  plugin: [CodeRun, CodeUploadFile, CodeListFiles, CodeResetSandbox],
};

module.exports = {
  codeInterpreterAgent,
};
