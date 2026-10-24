const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const {
  DEFAULT_CHUNK_DURATION,
  MAX_CHUNK_DURATION,
  MIN_CHUNK_DURATION,
  normalizeChunkDuration,
  parseSilence,
  readDuration,
  readSpeechDuration,
  splitAudioFile,
} = require("../../../utils/WhisperProviders/audioChunks");
const {
  FFMPEGWrapper,
} = require("../../../utils/WhisperProviders/ffmpeg");

function ffmpegAvailable() {
  const which = process.platform === "win32" ? "where" : "which";
  const found = (binary) =>
    spawnSync(which, [binary], { stdio: "ignore" }).status === 0;
  return found("ffmpeg") && found("ffprobe");
}

// The suite below needs a real ffmpeg/ffprobe pair on the machine.
const describeRunner =
  process.env.GITHUB_ACTIONS || !ffmpegAvailable() ? describe.skip : describe;

describe("audioChunks helpers", () => {
  it("falls back to the default chunk duration for unusable input", () => {
    expect(normalizeChunkDuration(undefined)).toBe(DEFAULT_CHUNK_DURATION);
    expect(normalizeChunkDuration(null)).toBe(DEFAULT_CHUNK_DURATION);
    expect(normalizeChunkDuration("")).toBe(DEFAULT_CHUNK_DURATION);
    expect(normalizeChunkDuration("abc")).toBe(DEFAULT_CHUNK_DURATION);
  });

  it("clamps the chunk duration to the supported range", () => {
    expect(normalizeChunkDuration(5)).toBe(MIN_CHUNK_DURATION);
    expect(normalizeChunkDuration(999999)).toBe(MAX_CHUNK_DURATION);
    expect(normalizeChunkDuration("600")).toBe(600);
  });

  it("sums up the silence reported by ffmpeg", () => {
    const stderr = [
      "[silencedetect @ 0x1] silence_start: 1.5",
      "[silencedetect @ 0x1] silence_end: 4.0 | silence_duration: 2.5",
      "[silencedetect @ 0x1] silence_start: 8.0",
      "[silencedetect @ 0x1] silence_end: 9.25 | silence_duration: 1.25",
    ].join("\n");

    expect(parseSilence(stderr, 10)).toBeCloseTo(3.75, 5);
  });

  it("counts a file that ends in silence", () => {
    const stderr = "[silencedetect @ 0x1] silence_start: 6.0";
    expect(parseSilence(stderr, 10)).toBeCloseTo(4, 5);
  });

  it("never reports more silence than the file length", () => {
    const stderr = "[silencedetect @ 0x1] silence_start: 0.0";
    expect(parseSilence(stderr, 3)).toBeCloseTo(3, 5);
    expect(parseSilence("", 3)).toBe(0);
  });
});

// These cases shell out to a real ffmpeg/ffprobe pair.
describeRunner("audioChunks with ffmpeg", () => {
  const testDir = path.resolve(
    __dirname,
    "../../../storage/tmp/chunks-test"
  );
  const sourcePath = path.join(testDir, "sample source (1).m4a");
  const silentPath = path.join(testDir, "silence.m4a");
  let ffmpegPath = null;

  beforeAll(async () => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    ffmpegPath = await new FFMPEGWrapper().ffmpegPath();

    const tone = spawnSync(
      ffmpegPath,
      [
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=10",
        "-c:a",
        "aac",
        sourcePath,
      ],
      { encoding: "utf8" }
    );
    if (tone.status !== 0) throw new Error(tone.stderr);

    const silence = spawnSync(
      ffmpegPath,
      [
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=44100:cl=mono",
        "-t",
        "5",
        "-c:a",
        "aac",
        silentPath,
      ],
      { encoding: "utf8" }
    );
    if (silence.status !== 0) throw new Error(silence.stderr);
  });

  afterAll(() => {
    if (fs.existsSync(testDir))
      fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("reads the duration of an audio file", async () => {
    expect(await readDuration(sourcePath)).toBeCloseTo(10, 0);
  });

  it("splits a file into chunks of the requested length", async () => {
    // Leftovers from an earlier run must not leak into the new split.
    const stale = path.join(testDir, "sample source (1)_part_999.mp3");
    fs.writeFileSync(stale, Buffer.alloc(0));

    const chunks = await splitAudioFile(sourcePath, {
      chunkDuration: 4,
      outputDir: testDir,
    });

    expect(chunks).toHaveLength(3);
    expect(chunks.some((chunk) => chunk.includes("_part_999"))).toBe(false);
    for (const chunk of chunks) {
      expect(path.extname(chunk)).toBe(".mp3");
      expect(fs.statSync(chunk).size).toBeGreaterThan(0);
      expect(await readDuration(chunk)).toBeLessThanOrEqual(4.5);
    }

    // The source file is owned by the caller and must survive the split.
    expect(fs.existsSync(sourcePath)).toBe(true);
  });

  it("detects speech in a tone", async () => {
    const result = await readSpeechDuration(sourcePath);
    expect(result.hasSpeech).toBe(true);
    expect(result.speechSeconds).toBeGreaterThan(8);
  });

  it("detects a chunk that contains no speech", async () => {
    const result = await readSpeechDuration(silentPath);
    expect(result.hasSpeech).toBe(false);
    expect(result.speechSeconds).toBeLessThan(1);
  });
});
