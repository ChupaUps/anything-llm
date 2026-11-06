const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const { randomUUID } = require("crypto");
const createFilesLib = require("../agents/aibitat/plugins/create-files/lib");

/**
 * Server-side document preview via headless LibreOffice.
 *
 * Converts agent-generated office documents (docx/xlsx/pptx and friends) to PDF
 * so the chat preview can render them faithfully (fonts, layout, colors) instead
 * of reconstructing them from persisted text. Results are cached on disk so each
 * file is converted at most once and subsequent previews are instant.
 *
 * All external commands run via spawn() with an args ARRAY (never a shell string)
 * so filenames cannot be used for injection.
 */
class DocumentPreview {
  /** Extensions that LibreOffice can render to PDF for a faithful preview. */
  static CONVERTIBLE_EXTENSIONS = new Set([
    "docx",
    "doc",
    "odt",
    "rtf",
    "xlsx",
    "xls",
    "ods",
    "csv",
    "pptx",
    "ppt",
    "odp",
  ]);

  #binary = undefined; // cached resolved path (or null if not found)
  #available = undefined; // cached boolean from a --version probe
  #inFlight = new Map(); // srcPath -> Promise<pdfPath> (dedupe concurrent converts)

  /**
   * Resolves the LibreOffice binary path, honoring LIBREOFFICE_PATH. Cached.
   * @returns {string|null}
   */
  resolveBinary() {
    if (this.#binary !== undefined) return this.#binary;
    const candidates = [
      process.env.LIBREOFFICE_PATH,
      "soffice",
      "libreoffice",
      "/usr/bin/soffice",
      "/usr/bin/libreoffice",
    ].filter(Boolean);

    // For bare names rely on PATH lookup; for absolute paths check existence.
    for (const candidate of candidates) {
      if (candidate.includes("/")) {
        if (fs.existsSync(candidate)) {
          this.#binary = candidate;
          return candidate;
        }
        continue;
      }
      const found = this.#which(candidate);
      if (found) {
        this.#binary = found;
        return found;
      }
    }
    this.#binary = null;
    return null;
  }

  #which(name) {
    try {
      const dirs = (process.env.PATH || "").split(path.delimiter);
      for (const dir of dirs) {
        const full = path.join(dir, name);
        if (fs.existsSync(full)) return full;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  /**
   * Whether a working LibreOffice binary is present (probed once, cached).
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    if (this.#available !== undefined) return this.#available;
    const bin = this.resolveBinary();
    if (!bin) {
      this.#available = false;
      return false;
    }
    this.#available = await new Promise((resolve) => {
      const child = spawn(bin, ["--version"], { stdio: "ignore" });
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve(false);
      }, 15_000);
      child.on("error", () => {
        clearTimeout(timer);
        resolve(false);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve(code === 0);
      });
    });
    return this.#available;
  }

  /** Whether the extension is one we render through LibreOffice. */
  isConvertible(ext) {
    return DocumentPreview.CONVERTIBLE_EXTENSIONS.has(
      String(ext || "").toLowerCase()
    );
  }

  #cacheDirectory(outputDirectory) {
    return path.join(outputDirectory, ".preview-cache");
  }

  /**
   * Returns a cached PDF path for the storage file, converting on first use.
   * @param {string} storageFilename - e.g. "pptx-<uuid>.pptx"
   * @returns {Promise<string>} absolute path to the rendered PDF
   * @throws {{code: string}} ENOLILOFFICE | ENOSRC | EFAILED
   */
  async getPreviewPdf(storageFilename) {
    const parsed = createFilesLib.parseFilename(storageFilename);
    if (!parsed) {
      const err = new Error("Invalid filename format");
      err.code = "EINVALID";
      throw err;
    }

    const outputDirectory = await createFilesLib.getOutputDirectory();
    const srcPath = path.join(outputDirectory, storageFilename);
    if (!fs.existsSync(srcPath)) {
      const err = new Error("Source file not found");
      err.code = "ENOSRC";
      throw err;
    }

    const cacheDir = this.#cacheDirectory(outputDirectory);
    const baseName = path.basename(
      storageFilename,
      path.extname(storageFilename)
    );
    const pdfPath = path.join(cacheDir, `${baseName}.pdf`);

    // Reuse cache when present and not older than the source document.
    if (fs.existsSync(pdfPath)) {
      const pdfMtime = fs.statSync(pdfPath).mtimeMs;
      const srcMtime = fs.statSync(srcPath).mtimeMs;
      if (pdfMtime >= srcMtime) return pdfPath;
    }

    // Dedupe concurrent conversions of the same source.
    if (this.#inFlight.has(srcPath)) return this.#inFlight.get(srcPath);

    const promise = this.#convert({ srcPath, cacheDir, pdfPath }).finally(() =>
      this.#inFlight.delete(srcPath)
    );
    this.#inFlight.set(srcPath, promise);
    return promise;
  }

  /**
   * Runs a single headless LibreOffice conversion to PDF.
   * @param {{srcPath: string, cacheDir: string, pdfPath: string}} params
   */
  async #convert({ srcPath, cacheDir, pdfPath }) {
    if (!(await this.isAvailable())) {
      const err = new Error("LibreOffice is not available on this server");
      err.code = "ENOLILOFFICE";
      throw err;
    }

    await fs.promises.mkdir(cacheDir, { recursive: true });

    // Each invocation gets its own user profile to avoid lock contention when
    // several conversions run in parallel.
    const profileDir = path.join(
      os.tmpdir(),
      `anythingllm-lo-profile-${randomUUID()}`
    );
    const bin = this.resolveBinary();
    // NOTE: LibreOffice's per-run options use a SINGLE leading dash (`-env:`);
    // a double dash (`--env:`) is treated as an unknown option and aborts with
    // exit code 1. `--nofirststartwizard` + `--nolockcheck` keep repeated
    // headless runs from blocking on first-run/lock prompts.
    const args = [
      "--headless",
      "--norestore",
      "--nolockcheck",
      "--nodefault",
      "--nofirststartwizard",
      `-env:UserInstallation=file://${profileDir}`,
      "--convert-to",
      "pdf",
      "--outdir",
      cacheDir,
      srcPath,
    ];

    await new Promise((resolve, reject) => {
      const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      let stdout = "";
      child.stdout?.on("data", (d) => (stdout += d.toString()));
      child.stderr?.on("data", (d) => (stderr += d.toString()));

      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(
          Object.assign(new Error("LibreOffice conversion timed out"), {
            code: "ETIMEOUT",
          })
        );
      }, 120_000);

      child.on("error", (e) => {
        clearTimeout(timer);
        reject(Object.assign(e, { code: e.code || "EFAILED" }));
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        // soffice exits 0 on success; the produced file is the real signal.
        if (fs.existsSync(pdfPath)) return resolve();
        reject(
          Object.assign(
            new Error(
              `LibreOffice produced no PDF (exit ${code}). out="${stdout.slice(
                0,
                200
              )}" err="${stderr.slice(0, 200)}"`
            ),
            { code: "EFAILED" }
          )
        );
      });
    }).finally(() => {
      // Best-effort profile cleanup; never fail the request over it.
      fs.promises
        .rm(profileDir, { recursive: true, force: true })
        .catch(() => {});
    });

    return pdfPath;
  }
}

module.exports = new DocumentPreview();
