const fs = require("fs");
const path = require("path");
const {
  normalizeChunkDuration,
  readDuration,
  readSpeechDuration,
  splitAudioFile,
} = require("./audioChunks");

/**
 * Shared orchestration for every audio transcription provider.
 *
 * Providers only have to implement `transcribe(filePath)`. Long audio is split
 * into chunks of `whisperChunkDuration` seconds, and chunks without any speech
 * are skipped so paid endpoints are never billed for silence.
 */
class ChunkedWhisperProvider {
  /** @param {{ options?: Object }} params */
  constructor({ options } = {}) {
    this.providerName = this.constructor.name;
    this.chunkDuration = normalizeChunkDuration(options?.whisperChunkDuration);
  }

  log(text, ...args) {
    console.log(`\x1b[32m[${this.providerName}]\x1b[0m ${text}`, ...args);
  }

  /**
   * Transcribes one audio file. Implemented by each provider.
   * @param {string} filePath
   * @returns {Promise<{ content: string, error: string|null }>}
   */
  async transcribe(filePath) {
    throw new Error(`${this.providerName} must implement transcribe()`);
  }

  /**
   * Entrypoint used by the collector.
   * @param {string} fullFilePath
   * @param {string} [filename]
   * @returns {Promise<{ content: string, error: string|null }>}
   */
  async processFile(fullFilePath, filename = path.basename(fullFilePath)) {
    let tempDir = null;
    let chunkFiles = [];
    let ownsChunks = false;

    try {
      const prepared = await this.#prepareChunks(fullFilePath);
      tempDir = prepared.tempDir;
      chunkFiles = prepared.chunks;
      ownsChunks = prepared.isTemp;
      if (chunkFiles.length > 1)
        this.log(`Split ${filename} into ${chunkFiles.length} chunks`);

      const parts = [];
      const failures = [];
      let successful = 0;
      let fatalError = null;

      for (let i = 0; i < chunkFiles.length; i++) {
        const chunkFile = chunkFiles[i];
        const position =
          chunkFiles.length > 1
            ? `chunk ${i + 1}/${chunkFiles.length}`
            : "audio file";

        if (!(await this.#hasSpeech(chunkFile, position))) continue;

        const { content, error } = await this.#runTranscribe(chunkFile);
        if (error) {
          this.log(`Failed to transcribe ${position}: ${error}`);
          failures.push({ position, error });
          if (this.isFatal(error)) {
            fatalError = error;
            break;
          }
          continue;
        }

        if (content?.trim()) parts.push(content.trim());
        successful++;
      }

      if (successful === 0) {
        return {
          content: "",
          error:
            fatalError ??
            failures[0]?.error ??
            `No speech was detected in ${filename}`,
        };
      }

      if (fatalError) return { content: "", error: fatalError };

      // Keep the transcript usable when only some chunks failed: the caller
      // gets the text it paid for plus a visible note about the missing part.
      for (const { position, error } of failures)
        parts.push(`[Transcription failed for ${position}: ${error}]`);

      if (failures.length > 0)
        this.log(
          `Transcribed ${successful}/${chunkFiles.length} chunks of ${filename}, ${failures.length} failed`
        );

      return { content: parts.join("\n\n"), error: null };
    } catch (error) {
      this.log(`Error processing ${filename}: ${error.message}`);
      return { content: "", error: error.message };
    } finally {
      this.#cleanup(ownsChunks ? chunkFiles : [], tempDir);
    }
  }

  /**
   * Splits the source into chunks when it is longer than the configured chunk
   * duration. Returns the original file untouched when no split is needed.
   * `isTemp` is true only when the returned paths are files this instance owns
   * and is therefore allowed to delete.
   * @param {string} fullFilePath
   * @returns {Promise<{ chunks: string[], tempDir: string|null, isTemp: boolean }>}
   */
  async #prepareChunks(fullFilePath) {
    let duration;
    try {
      duration = await readDuration(fullFilePath);
    } catch (error) {
      this.log(
        `Could not read audio duration (${error.message}) - transcribing as a single file`
      );
      return { chunks: [fullFilePath], tempDir: null, isTemp: false };
    }

    this.log(`Audio duration ${Math.round(duration)} seconds`);
    if (duration <= this.chunkDuration)
      return { chunks: [fullFilePath], tempDir: null, isTemp: false };

    this.log(
      `File is longer than ${this.chunkDuration}s, splitting into ${this.chunkDuration}s chunks`
    );

    const tempDir = path.join(path.dirname(fullFilePath), "temp_chunks");
    try {
      const chunks = await splitAudioFile(fullFilePath, {
        chunkDuration: this.chunkDuration,
        outputDir: tempDir,
      });
      return { chunks, tempDir, isTemp: true };
    } catch (error) {
      // A failed split should not lose the document outright - the provider
      // request below is simply attempted with the original file.
      this.log(
        `Could not split audio (${error.message}) - transcribing whole file`
      );
      return { chunks: [fullFilePath], tempDir, isTemp: false };
    }
  }

  /**
   * @param {string} filePath
   * @param {string} position
   * @returns {Promise<boolean>}
   */
  async #hasSpeech(filePath, position) {
    try {
      const { duration, speechSeconds, hasSpeech } =
        await readSpeechDuration(filePath);
      if (hasSpeech) return true;

      this.log(
        `${position}: no speech detected (${duration.toFixed(1)}s of silence) - skipping, nothing is sent to the provider`
      );
      return false;
    } catch (error) {
      this.log(
        `${position}: silence check failed (${error.message}) - transcribing anyway`
      );
      return true;
    }
  }

  /**
   * Providers signal failures by returning an error, but a thrown exception is
   * treated the same way so a single chunk can never abort the whole document.
   * @param {string} filePath
   * @returns {Promise<{ content: string, error: string|null }>}
   */
  async #runTranscribe(filePath) {
    try {
      return await this.transcribe(filePath);
    } catch (error) {
      return { content: "", error: error.message || "Unknown error" };
    }
  }

  /**
   * Billing and quota errors are not worth retrying on the remaining chunks.
   * @param {string} error
   * @returns {boolean}
   */
  isFatal(error) {
    return (
      error.includes("402") ||
      error.includes("payment") ||
      error.includes("quota")
    );
  }

  /**
   * @param {string[]} chunkFiles
   * @param {string|null} tempDir
   */
  #cleanup(chunkFiles, tempDir) {
    for (const chunkFile of chunkFiles) {
      try {
        if (fs.existsSync(chunkFile)) fs.rmSync(chunkFile, { force: true });
      } catch (error) {
        this.log(`Error cleaning up ${chunkFile}: ${error.message}`);
      }
    }

    if (!tempDir) return;
    try {
      if (fs.existsSync(tempDir) && fs.readdirSync(tempDir).length === 0)
        fs.rmdirSync(tempDir);
    } catch {
      // The directory is shared between files - leaving it in place is fine.
    }
  }
}

module.exports = { ChunkedWhisperProvider };
