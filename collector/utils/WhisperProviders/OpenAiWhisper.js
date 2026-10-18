const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

class OpenAiWhisper {
  constructor({ options }) {
    const { OpenAI: OpenAIApi } = require("openai");
    if (!options.openAiKey) throw new Error("No OpenAI API key was set.");

    this.openai = new OpenAIApi({
      apiKey: options.openAiKey,
      baseURL: "https://api.proxyapi.ru/openai/v1",
    });
    this.model = "gpt-4o-mini-transcribe";
    this.temperature = 0;
    this.maxDuration = 1400; // 23 минуты в секундах
    this.chunkDuration = 1200; // 20 минут для надежности
    this.maxRetries = 3; // Максимальное количество повторов
    this.retryDelay = 2000; // Задержка между повторами в мс
    this.#log("Initialized.");
  }

  #log(text, ...args) {
    console.log(`\x1b[32m[OpenAiWhisper]\x1b[0m ${text}`, ...args);
  }

  // Улучшенная проверка длительности с обработкой ошибок
  async getAudioDuration(fullFilePath) {
    try {
      if (!fs.existsSync(fullFilePath)) {
        throw new Error(`File not found: ${fullFilePath}`);
      }

      const ffprobeOutput = execSync(
        `ffprobe -v error -show_entries format=duration -of csv="p=0" "${fullFilePath}"`
      ).toString().trim();

      if (!ffprobeOutput) {
        throw new Error("Could not get duration from ffprobe");
      }

      const duration = parseFloat(ffprobeOutput);
      if (isNaN(duration)) {
        throw new Error("Invalid duration received");
      }

      return Math.ceil(duration);
    } catch (error) {
      this.#log(`Could not get audio duration: ${error.message}`);
      return null;
    }
  }

  // Разделение аудиофайла на части с улучшенной обработкой ошибок
  async splitAudioFile(fullFilePath, outputDir) {
    try {
      if (!fs.existsSync(fullFilePath)) {
        throw new Error(`Source file not found: ${fullFilePath}`);
      }

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const baseName = path.basename(fullFilePath, path.extname(fullFilePath));
      const chunkPattern = path.join(outputDir, `${baseName}_part_%03d.mp3`);

      this.#log(`Splitting file into chunks with pattern: ${chunkPattern}`);

      execSync(
        `ffmpeg -v error -i "${fullFilePath}" -f segment -segment_time ${this.chunkDuration} -c copy "${chunkPattern}"`,
        { stdio: 'pipe' }
      );

      // Ждем немного чтобы все файлы были записаны
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Получаем список созданных частей
      const files = fs.readdirSync(outputDir);
      const chunkFiles = files
        .filter(file => file.startsWith(`${baseName}_part_`) && file.endsWith('.mp3'))
        .map(file => path.join(outputDir, file))
        .sort();

      if (chunkFiles.length === 0) {
        throw new Error("No chunks were created during splitting");
      }

      this.#log(`Created ${chunkFiles.length} chunks successfully`);
      return chunkFiles;

    } catch (error) {
      this.#log(`Error splitting audio file: ${error.message}`);
      throw error;
    }
  }

  // Очистка временных файлов
  cleanupTempFiles(filePaths) {
    filePaths.forEach(filePath => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          this.#log(`Cleaned up temporary file: ${path.basename(filePath)}`);
        }
      } catch (error) {
        this.#log(`Error cleaning up file ${filePath}: ${error.message}`);
      }
    });
  }

  // Улучшенная функция транскрипции с повторами
  async transcribeFileWithRetry(filePath, chunkNumber = null, totalChunks = null) {
    const chunkInfo = chunkNumber ? ` (chunk ${chunkNumber}/${totalChunks})` : '';
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          this.#log(`Retry attempt ${attempt}/${this.maxRetries} for ${path.basename(filePath)}${chunkInfo}`);
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        }

        // Проверяем что файл существует и доступен
        if (!fs.existsSync(filePath)) {
          throw new Error(`File not found: ${filePath}`);
        }

        const fileStats = fs.statSync(filePath);
        if (fileStats.size === 0) {
          throw new Error(`File is empty: ${filePath}`);
        }

        const response = await this.openai.audio.transcriptions.create({
          file: fs.createReadStream(filePath),
          model: this.model,
          temperature: this.temperature,
        });

        if (!response || !response.text) {
          throw new Error("No transcription content received");
        }

        this.#log(`Successfully transcribed ${path.basename(filePath)}${chunkInfo}${attempt > 1 ? ` on attempt ${attempt}` : ''}`);
        return { content: response.text, error: null };

      } catch (error) {
        const errorMsg = error.message || 'Unknown error';
        
        // Логируем ошибку
        if (attempt === this.maxRetries) {
          this.#log(`Final attempt failed for ${path.basename(filePath)}${chunkInfo}: ${errorMsg}`);
          return { content: "", error: errorMsg };
        } else {
          this.#log(`Attempt ${attempt} failed for ${path.basename(filePath)}${chunkInfo}: ${errorMsg}`);
          
          // Если это ошибка 402 (лимиты), не повторяем
          if (errorMsg.includes('402') || errorMsg.includes('payment') || errorMsg.includes('quota')) {
            this.#log(`Stopping retries due to payment/limit error for ${path.basename(filePath)}`);
            return { content: "", error: errorMsg };
          }
        }
      }
    }

    return { content: "", error: "All retry attempts failed" };
  }

  // Обработка длинных файлов с улучшенной логикой
  async processLongFile(fullFilePath) {
    const tempDir = path.join(path.dirname(fullFilePath), 'temp_chunks');
    let chunkFiles = [];

    try {
      // Разделяем файл на части
      chunkFiles = await this.splitAudioFile(fullFilePath, tempDir);
      this.#log(`Split into ${chunkFiles.length} chunks`);

      // Транскрибируем каждую часть с повторами
      const transcriptions = [];
      let successfulChunks = 0;
      let failedChunks = 0;

      for (let i = 0; i < chunkFiles.length; i++) {
        this.#log(`Processing chunk ${i + 1}/${chunkFiles.length}`);
        
        const result = await this.transcribeFileWithRetry(
          chunkFiles[i], 
          i + 1, 
          chunkFiles.length
        );
        
        if (result.error) {
          this.#log(`Failed to transcribe chunk ${i + 1}: ${result.error}`);
          failedChunks++;
          
          // Если это критическая ошибка (лимиты), прерываем процесс
          if (result.error.includes('402') || result.error.includes('payment') || result.error.includes('quota')) {
            this.#log(`Stopping transcription due to payment/limit error`);
            break;
          }
          
          // Продолжаем с другими чанками даже если один упал
          transcriptions.push(`[TRANSCRIPTION FAILED for chunk ${i + 1}: ${result.error}]`);
        } else {
          transcriptions.push(result.content);
          successfulChunks++;
        }
      }

      // Объединяем результаты
      const fullTranscription = transcriptions.join('\n\n');
      
      if (successfulChunks > 0) {
        this.#log(`Successfully transcribed ${successfulChunks}/${chunkFiles.length} chunks`);
        return { 
          content: fullTranscription, 
          error: failedChunks > 0 ? `Partially completed: ${failedChunks} chunks failed` : null 
        };
      } else {
        throw new Error(`All ${chunkFiles.length} chunks failed to transcribe`);
      }

    } catch (error) {
      this.#log(`Error processing long file: ${error.message}`);
      return { content: "", error: error.message };
    } finally {
      // Очищаем временные файлы
      if (chunkFiles.length > 0) {
        this.cleanupTempFiles(chunkFiles);
      }
      // Пытаемся удалить временную директорию
      try {
        if (fs.existsSync(tempDir) && fs.readdirSync(tempDir).length === 0) {
          fs.rmdirSync(tempDir);
        }
      } catch (error) {
        // Игнорируем ошибки удаления директории
      }
    }
  }

  // Основной метод обработки файла
  async processFile(fullFilePath) {
    try {
      // Проверяем существование файла
      if (!fs.existsSync(fullFilePath)) {
        throw new Error(`File not found: ${fullFilePath}`);
      }

      // Проверяем длительность файла
      const duration = await this.getAudioDuration(fullFilePath);
      
      if (duration === null) {
        return { content: "", error: "Could not determine audio duration" };
      }

      this.#log(`Audio duration ${duration} seconds`);

      // Если файл слишком длинный, разделяем его
      if (duration > this.maxDuration) {
        this.#log(`File is too long, splitting into chunks...`);
        return await this.processLongFile(fullFilePath);
      } else {
        // Обрабатываем файл как обычно с повторами
        return await this.transcribeFileWithRetry(fullFilePath);
      }
    } catch (error) {
      this.#log(`Error in processFile: ${error.message}`);
      return { content: "", error: error.message };
    }
  }
}

module.exports = {
  OpenAiWhisper,
};