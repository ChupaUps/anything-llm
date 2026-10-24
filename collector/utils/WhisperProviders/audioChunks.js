const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { FFMPEGWrapper } = require("./ffmpeg");

/**
 * Audio splitting and speech-detection helpers shared by every whisper
 * provider.
 *
 * Everything here shells out to ffmpeg/ffprobe with an argument array instead
 * of a command string, so filenames containing spaces, quotes or parentheses
 * cannot break the invocation.
 */

const DEFAULT_CHUNK_DURATION = 20 * 60;
const MIN_CHUNK_DURATION = 30;
const MAX_CHUNK_DURATION = 60 * 60;

// The segment muxer always leaves a tiny trailing fragment under a second.
// Sending it to a paid provider can only produce an API error, so it is dropped.
const MIN_CHUNK_SECONDS = 1;

// Anything quieter than -35 dB sustained for 0.6s counts as silence, and a
// chunk needs at least 1 second of actual speech to be worth transcribing.
const SILENCE_NOISE_DB = -35;
const SILENCE_MIN_SECONDS = 0.6;
const MIN_SPEECH_SECONDS = 1;

/**
 * Chunk length coming from the admin UI is user input, so clamp it to a range
 * where splitting still makes sense and a single job cannot explode.
 *
 * @param {number|string|null|undefined} value
 * @returns {number} chunk duration in seconds
 */
function normalizeChunkDuration(value) {
  const seconds = parseInt(value, 10);
  if (!Number.isFinite(seconds)) return DEFAULT_CHUNK_DURATION;
  return Math.min(Math.max(seconds, MIN_CHUNK_DURATION), MAX_CHUNK_DURATION);
}

/**
 * @param {string} binary
 * @param {string[]} args
 * @returns {{ status: number|null, stdout: string, stderr: string }}
 */
function run(binary, args) {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

/**
 * Reads the total duration of an audio file in seconds.
 * @param {string} filePath
 * @returns {Promise<number>}
 */
async function readDuration(filePath) {
  const ffprobe = await new FFMPEGWrapper().ffprobePath();
  const { status, stdout, stderr } = run(ffprobe, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    filePath,
  ]);

  if (status !== 0) throw new Error(stderr.trim() || "ffprobe failed");
  const duration = parseFloat(stdout.trim());
  if (!Number.isFinite(duration))
    throw new Error("Could not read audio duration");
  return duration;
}

/**
 * Sums up the silence periods reported by ffmpeg's silencedetect filter.
 * @param {string} stderr
 * @param {number} totalDuration
 * @returns {number} silence in seconds
 */
function parseSilence(stderr, totalDuration) {
  let silence = 0;
  let openStart = null;
  const pattern = /silence_(start|end):\s*([\d.]+)/g;
  let match;

  while ((match = pattern.exec(stderr))) {
    const timestamp = parseFloat(match[2]);
    if (match[1] === "start") {
      openStart = timestamp;
    } else if (openStart !== null) {
      silence += Math.max(0, timestamp - openStart);
      openStart = null;
    }
  }

  // A file that ends in silence has a start without a matching end.
  if (openStart !== null) silence += Math.max(0, totalDuration - openStart);
  return Math.min(silence, totalDuration);
}

/**
 * Detects how much of an audio file actually contains speech.
 * Decoding a file is cheap compared to sending it to a paid transcription
 * endpoint, so this runs before every request.
 *
 * @param {string} filePath
 * @returns {Promise<{ duration: number, speechSeconds: number, hasSpeech: boolean }>}
 */
async function readSpeechDuration(filePath) {
  const ffmpeg = await new FFMPEGWrapper().ffmpegPath();
  const { status, stderr } = run(ffmpeg, [
    "-hide_banner",
    "-nostats",
    "-v",
    "info",
    "-i",
    filePath,
    "-af",
    `silencedetect=noise=${SILENCE_NOISE_DB}dB:d=${SILENCE_MIN_SECONDS}`,
    "-f",
    "null",
    "-",
  ]);

  if (status !== 0)
    throw new Error(stderr.trim() || "Could not analyze audio for speech");

  const duration = await readDuration(filePath);
  const silence = parseSilence(stderr, duration);
  const speechSeconds = Math.max(0, duration - silence);

  return {
    duration,
    speechSeconds,
    hasSpeech: speechSeconds >= MIN_SPEECH_SECONDS,
  };
}

/**
 * Splits an audio file into chunks of `chunkDuration` seconds.
 *
 * Chunks are re-encoded to 16 kHz mono mp3, which is what every whisper
 * endpoint resamples to anyway. Copying the source codec (`-c copy`) is not an
 * option here: the source may be AAC/m4a, and an mp3 container only accepts
 * MP3 streams.
 *
 * @param {string} sourcePath
 * @param {{ chunkDuration: number, outputDir: string }} options
 * @returns {Promise<string[]>} paths of the created chunks, sorted
 */
async function splitAudioFile(sourcePath, { chunkDuration, outputDir }) {
  if (!fs.existsSync(sourcePath))
    throw new Error(`Source file not found: ${sourcePath}`);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const baseName = path.basename(sourcePath, path.extname(sourcePath));
  const prefix = `${baseName}_part_`;
  const extension = ".mp3";
  const chunkPattern = path.join(outputDir, `${prefix}%03d${extension}`);

  // Remove leftovers of an earlier failed attempt for this same source,
  // otherwise they would be picked up and transcribed again.
  for (const file of fs.readdirSync(outputDir)) {
    if (file.startsWith(prefix) && file.endsWith(extension))
      fs.rmSync(path.join(outputDir, file), { force: true });
  }

  const ffmpeg = await new FFMPEGWrapper().ffmpegPath();
  const { status, stderr } = run(ffmpeg, [
    "-hide_banner",
    "-nostats",
    "-v",
    "error",
    "-y",
    "-i",
    sourcePath,
    "-f",
    "segment",
    "-segment_time",
    String(chunkDuration),
    "-reset_timestamps",
    "1",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "32k",
    chunkPattern,
  ]);

  if (status !== 0)
    throw new Error(stderr.trim() || "Could not split audio into chunks");

  const chunkFiles = fs
    .readdirSync(outputDir)
    .filter((file) => file.startsWith(prefix) && file.endsWith(extension))
    .map((file) => path.join(outputDir, file))
    .sort();

  if (chunkFiles.length === 0) throw new Error("No chunks were created");

  const usableChunks = [];
  for (const chunkFile of chunkFiles) {
    const duration = await readDuration(chunkFile);
    if (duration < MIN_CHUNK_SECONDS) {
      fs.rmSync(chunkFile, { force: true });
      continue;
    }
    usableChunks.push(chunkFile);
  }

  if (usableChunks.length === 0)
    throw new Error("All created chunks were empty");

  return usableChunks;
}

module.exports = {
  DEFAULT_CHUNK_DURATION,
  MIN_CHUNK_DURATION,
  MAX_CHUNK_DURATION,
  MIN_SPEECH_SECONDS,
  SILENCE_NOISE_DB,
  SILENCE_MIN_SECONDS,
  normalizeChunkDuration,
  parseSilence,
  readDuration,
  readSpeechDuration,
  splitAudioFile,
};
