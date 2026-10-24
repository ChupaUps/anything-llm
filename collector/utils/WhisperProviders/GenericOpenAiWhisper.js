const fs = require("fs");
const path = require("path");
const { ChunkedWhisperProvider } = require("./ChunkedWhisperProvider");

class GenericOpenAiWhisper extends ChunkedWhisperProvider {
  constructor({ options }) {
    super({ options });
    const { OpenAI: OpenAIApi } = require("openai");
    if (!options.WhisperGenericOpenAiBaseUrl)
      throw new Error("No base URL was set.");

    this.openai = new OpenAIApi({
      baseURL: options.WhisperGenericOpenAiBaseUrl,
      apiKey: options.WhisperGenericOpenAiApiKey || null,
    });
    this.model = options.WhisperGenericOpenAiModel || "whisper-small";
    this.temperature = 0;
    this.log("Initialized.");
  }

  /**
   * @param {string} filePath
   * @returns {Promise<{ content: string, error: string|null }>}
   */
  async transcribe(filePath) {
    try {
      const response = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: this.model,
        temperature: this.temperature,
      });

      if (!response || !response.text)
        return {
          content: "",
          error: "No content was able to be transcribed.",
        };

      this.log(`Successfully transcribed ${path.basename(filePath)}`);
      return { content: response.text, error: null };
    } catch (error) {
      this.log(
        `Could not get any response from openai compatible whisper endpoint`,
        error.message
      );
      return { content: "", error: error.message };
    }
  }
}

module.exports = {
  GenericOpenAiWhisper,
};
