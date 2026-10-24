const fs = require("fs");
const path = require("path");
const { ChunkedWhisperProvider } = require("./ChunkedWhisperProvider");

class OpenAiWhisper extends ChunkedWhisperProvider {
  constructor({ options }) {
    super({ options });
    const { OpenAI: OpenAIApi } = require("openai");
    if (!options.openAiKey) throw new Error("No OpenAI API key was set.");

    this.openai = new OpenAIApi({
      apiKey: options.openAiKey,
      baseURL: "https://api.proxyapi.ru/openai/v1",
    });
    this.model = "gpt-4o-mini-transcribe";
    this.temperature = 0;
    this.maxRetries = 3; // Максимальное количество повторов
    this.retryDelay = 2000; // Задержка между повторами в мс
    this.log("Initialized.");
  }

  /**
   * Sends a single (already prepared) file to the transcription endpoint and
   * retries transient failures. Chunking lives in the base class.
   * @param {string} filePath
   * @returns {Promise<{ content: string, error: string|null }>}
   */
  async transcribe(filePath) {
    const name = path.basename(filePath);

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          this.log(`Retry attempt ${attempt}/${this.maxRetries} for ${name}`);
          await new Promise((resolve) =>
            setTimeout(resolve, this.retryDelay * attempt)
          );
        }

        // Проверяем что файл существует и доступен
        if (!fs.existsSync(filePath))
          throw new Error(`File not found: ${filePath}`);
        if (fs.statSync(filePath).size === 0)
          throw new Error(`File is empty: ${filePath}`);

        const response = await this.openai.audio.transcriptions.create({
          file: fs.createReadStream(filePath),
          model: this.model,
          temperature: this.temperature,
        });

        if (!response || !response.text)
          throw new Error("No transcription content received");

        this.log(
          `Successfully transcribed ${name}${attempt > 1 ? ` on attempt ${attempt}` : ""}`
        );
        return { content: response.text, error: null };
      } catch (error) {
        const errorMsg = error.message || "Unknown error";
        if (attempt === this.maxRetries || this.isFatal(errorMsg)) {
          this.log(`Final attempt failed for ${name}: ${errorMsg}`);
          return { content: "", error: errorMsg };
        }

        this.log(`Attempt ${attempt} failed for ${name}: ${errorMsg}`);
      }
    }

    return { content: "", error: "All retry attempts failed" };
  }
}

module.exports = {
  OpenAiWhisper,
};
