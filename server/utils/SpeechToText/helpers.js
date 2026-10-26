const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { v4 } = require("uuid");
const { CollectorApi } = require("../collectorApi");
const { hotdirPath, isWithin } = require("../files");

const execFileAsync = promisify(execFile);

/**
 * Convert an audio buffer to a 16kHz mono WAV buffer via the collector's
 * FFMPEG wrapper. Use this when the downstream STT provider (e.g. Lemonade)
 * runs a whisper.cpp backend that rejects webm/opus input.
 * @param {Buffer} audioBuffer - Source audio buffer.
 * @param {string} extension - Source file extension including the leading dot (e.g. ".webm").
 * @returns {Promise<Buffer>} The converted WAV buffer.
 */
async function convertAudioBufferToWav(audioBuffer, extension) {
  let wavPath = null;
  const sourceFilename = `stt-${v4()}${extension}`;
  const sourcePath = path.resolve(hotdirPath, sourceFilename);
  if (!isWithin(hotdirPath, sourcePath))
    throw new Error("Source path is outside the hotdir.");

  try {
    await fs.writeFile(sourcePath, audioBuffer);
    const result = await new CollectorApi().convertAudioToWav(sourceFilename);
    if (!result?.success || !result?.wavFilename)
      throw new Error(result?.reason || "Audio conversion failed.");

    wavPath = path.resolve(hotdirPath, result.wavFilename);
    return await fs.readFile(wavPath);
  } finally {
    await fs.rm(sourcePath, { force: true }).catch(() => {});
    if (wavPath) await fs.rm(wavPath, { force: true }).catch(() => {});
  }
}

/**
 * Measures how long an audio buffer actually is by probing the container with
 * ffprobe. Transcription usage is accounted from this value so the dashboard
 * does not depend on the client reporting the duration correctly.
 *
 * @param {Buffer} audioBuffer - Source audio buffer.
 * @param {string} [extension] - Container extension including the leading dot.
 * @returns {Promise<number|null>} Duration in seconds, or null when ffprobe is
 * unavailable or cannot read the file (eg: bare-metal installs without ffmpeg).
 */
async function measureAudioDuration(audioBuffer, extension = ".webm") {
  if (!audioBuffer?.length) return null;
  const safeExtension = /^\.[a-z0-9]{1,5}$/i.test(extension)
    ? extension
    : ".webm";
  const tempPath = path.join(
    os.tmpdir(),
    `stt-duration-${v4()}${safeExtension}`
  );

  try {
    await fs.writeFile(tempPath, audioBuffer);
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        tempPath,
      ],
      { timeout: 15000, maxBuffer: 1024 * 1024 }
    );

    const duration = Number.parseFloat(String(stdout).trim());
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch {
    return null;
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
}

module.exports = { convertAudioBufferToWav, measureAudioDuration };
