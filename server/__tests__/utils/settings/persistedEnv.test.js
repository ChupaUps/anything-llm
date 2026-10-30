const fs = require("fs");
const os = require("os");
const path = require("path");

var mockDecrypt = jest.fn();
const mockFindMany = jest.fn();
const mockUpsert = jest.fn();
const mockFindUnique = jest.fn();
const mockCount = jest.fn();
const mockDataConnectors = jest.fn();
const mockSqlConnectors = jest.fn();

const mockPrisma = {
  system_settings: {
    findMany: (...args) => mockFindMany(...args),
    upsert: (...args) => mockUpsert(...args),
    findUnique: (...args) => mockFindUnique(...args),
  },
  document_vectors: {
    count: (...args) => mockCount(...args),
  },
  workspace_data_connectors: {
    findMany: (...args) => mockDataConnectors(...args),
  },
  workspace_sql_connectors: {
    findMany: (...args) => mockSqlConnectors(...args),
  },
};

jest.mock("../../../utils/prisma", () => mockPrisma);
jest.mock("../../../utils/EncryptionManager", () => ({
  EncryptionManager: class {
    decrypt(value) {
      return mockDecrypt(value);
    }
  },
}));
jest.mock("../../../utils/helpers/updateENV", () => ({
  KEY_MAPPING: {
    LLMProvider: { envKey: "LLM_PROVIDER" },
    OpenAiKey: { envKey: "OPEN_AI_KEY" },
    EmbeddingEngine: { envKey: "EMBEDDING_ENGINE" },
    EmbeddingModelPref: { envKey: "EMBEDDING_MODEL_PREF" },
    VectorDB: { envKey: "VECTOR_DB" },
    AuthToken: { envKey: "AUTH_TOKEN" },
    JWTSecret: { envKey: "JWT_SECRET" },
  },
}));
jest.mock("../../../utils/EmbeddingEngines/native", () => ({
  NativeEmbedder: {
    defaultModel: "Xenova/all-MiniLM-L6-v2",
    supportedModels: { "Xenova/all-MiniLM-L6-v2": {} },
  },
}));

const {
  hydrateEnvFromDatabase,
  persistEnvSettings,
  persistEnvValues,
  rememberVectorSignature,
  verifyEncryptedSecrets,
} = require("../../../utils/settings/persistedEnv");

const MANAGED_KEYS = [
  "LLM_PROVIDER",
  "OPEN_AI_KEY",
  "EMBEDDING_ENGINE",
  "EMBEDDING_MODEL_PREF",
  "VECTOR_DB",
  "EMBEDDING_OUTPUT_DIMENSIONS",
  "SIG_KEY",
  "SIG_SALT",
  "AUTH_TOKEN",
  "JWT_SECRET",
  "DISABLE_DB_SETTINGS",
];

const ORIGINAL_ENV = process.env;

// The boot hydration repairs the ENV file on disk, so every test points it at a
// throwaway file instead of server/.env.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "db-settings-"));
const ENV_FILE = path.join(TMP_DIR, ".env");
const HYDRATE = { envFile: ENV_FILE };

function storedRows(entries = {}) {
  return Object.entries(entries).map(([key, value]) => ({
    label: `env:${key}`,
    value,
  }));
}

function upsertedLabels() {
  return mockUpsert.mock.calls.map(([args]) => args.where.label);
}

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:pass@postgres:5432/anythingllm",
  };
  for (const key of MANAGED_KEYS) delete process.env[key];

  mockFindMany.mockReset().mockResolvedValue([]);
  mockUpsert.mockReset().mockResolvedValue({});
  mockFindUnique.mockReset().mockResolvedValue(null);
  mockCount.mockReset().mockResolvedValue(0);
  mockDataConnectors.mockReset().mockResolvedValue([]);
  mockSqlConnectors.mockReset().mockResolvedValue([]);
  mockDecrypt.mockReset().mockReturnValue(null);
  fs.writeFileSync(ENV_FILE, "", { encoding: "utf8" });
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  jest.restoreAllMocks();
});

describe("hydrateEnvFromDatabase", () => {
  it("restores the LLM credentials a rebuilt container no longer has", async () => {
    mockFindMany.mockResolvedValue(
      storedRows({ LLM_PROVIDER: "openai", OPEN_AI_KEY: "sk-restored" })
    );

    const summary = await hydrateEnvFromDatabase(HYDRATE);

    expect(process.env.LLM_PROVIDER).toBe("openai");
    expect(process.env.OPEN_AI_KEY).toBe("sk-restored");
    expect(summary.restored).toEqual(["LLM_PROVIDER", "OPEN_AI_KEY"]);
  });

  it("copies values from the ENV file into the database for the next update", async () => {
    process.env.OPEN_AI_KEY = "sk-from-env";

    const summary = await hydrateEnvFromDatabase(HYDRATE);

    expect(upsertedLabels()).toContain("env:OPEN_AI_KEY");
    expect(summary.synced).toContain("OPEN_AI_KEY");
  });

  it("keeps the stored embedding selection when the ENV file disagrees", async () => {
    mockFindMany.mockResolvedValue(
      storedRows({
        EMBEDDING_ENGINE: "native",
        EMBEDDING_MODEL_PREF: "Xenova/bge-small-en-v1.5",
      })
    );
    process.env.EMBEDDING_ENGINE = "native";
    process.env.EMBEDDING_MODEL_PREF = "Xenova/all-MiniLM-L6-v2";

    const summary = await hydrateEnvFromDatabase(HYDRATE);

    expect(process.env.EMBEDDING_MODEL_PREF).toBe(
      "Xenova/bge-small-en-v1.5"
    );
    expect(summary.pinned).toContain("EMBEDDING_MODEL_PREF");
  });

  it("switches back to the embedder that produced the stored vectors", async () => {
    mockFindUnique.mockResolvedValue({
      value: JSON.stringify({
        vectorDb: "lancedb",
        engine: "native",
        model: "Xenova/bge-small-en-v1.5",
        dimensions: "",
      }),
    });
    mockCount.mockResolvedValue(42);

    await hydrateEnvFromDatabase(HYDRATE);

    expect(process.env.EMBEDDING_MODEL_PREF).toBe(
      "Xenova/bge-small-en-v1.5"
    );
  });

  it("accepts a new embedder while nothing has been embedded yet", async () => {
    mockFindUnique.mockResolvedValue({
      value: JSON.stringify({
        vectorDb: "lancedb",
        engine: "native",
        model: "Xenova/bge-small-en-v1.5",
        dimensions: "",
      }),
    });
    mockCount.mockResolvedValue(0);

    await hydrateEnvFromDatabase(HYDRATE);

    expect(process.env.EMBEDDING_MODEL_PREF).toBeUndefined();
    expect(upsertedLabels()).toContain("vector_store_signature");
  });

  it("does nothing when the database fallback is disabled", async () => {
    process.env.DISABLE_DB_SETTINGS = "true";

    const summary = await hydrateEnvFromDatabase(HYDRATE);

    expect(mockFindMany).not.toHaveBeenCalled();
    expect(summary).toEqual({ restored: [], pinned: [], synced: [] });
  });

  it("writes the restored values back into the ENV file", async () => {
    fs.writeFileSync(
      ENV_FILE,
      "# operator comment\nUID='1000'\nLLM_PROVIDER=openai\n",
      { encoding: "utf8" }
    );
    mockFindMany.mockResolvedValue(
      storedRows({ LLM_PROVIDER: "azure", OPEN_AI_KEY: "sk-restored" })
    );

    await hydrateEnvFromDatabase(HYDRATE);

    const file = fs.readFileSync(ENV_FILE, { encoding: "utf8" });
    expect(file).toContain("LLM_PROVIDER='azure'");
    expect(file).toContain("OPEN_AI_KEY='sk-restored'");
    expect(file).toContain("UID='1000'");
    expect(file).toContain("# operator comment");
  });
});

describe("persistEnvSettings", () => {
  it("stores saved settings but leaves authentication in the ENV file", async () => {
    await persistEnvSettings({
      OpenAiKey: "sk-new",
      AuthToken: "secret",
      JWTSecret: "jwt",
    });

    const labels = upsertedLabels();
    expect(labels).toContain("env:OPEN_AI_KEY");
    expect(labels).not.toContain("env:AUTH_TOKEN");
    expect(labels).not.toContain("env:JWT_SECRET");
  });

  it("refreshes the embedding signature when the embedder changes", async () => {
    process.env.EMBEDDING_ENGINE = "native";
    process.env.EMBEDDING_MODEL_PREF = "Xenova/bge-small-en-v1.5";

    await persistEnvSettings({
      EmbeddingModelPref: "Xenova/bge-small-en-v1.5",
    });

    expect(upsertedLabels()).toEqual(
      expect.arrayContaining(["env:EMBEDDING_MODEL_PREF", "vector_store_signature"])
    );
  });
});

describe("persistEnvValues", () => {
  it("stores generated encryption keys", async () => {
    await persistEnvValues({ SIG_KEY: "generated-key", SIG_SALT: "salt" });

    expect(upsertedLabels()).toEqual(
      expect.arrayContaining(["env:SIG_KEY", "env:SIG_SALT"])
    );
  });
});

describe("verifyEncryptedSecrets", () => {
  it("accepts the 1C, Bitrix24 and SQL credentials the current key reads", async () => {
    mockDataConnectors.mockResolvedValue([
      { id: 7, name: "1C · Номенклатура", provider: "1c", auth_secret: "key" },
    ]);
    mockSqlConnectors.mockResolvedValue([
      {
        id: 3,
        name: "Склад",
        engine: "postgresql",
        connection_string: "key",
      },
    ]);
    mockDecrypt.mockReturnValue("decrypted");

    const result = await verifyEncryptedSecrets();

    expect(result).toEqual({ checked: 2, unreadable: [] });
  });

  it("lists the connections whose secrets a new key can no longer read", async () => {
    mockDataConnectors.mockResolvedValue([
      { id: 7, name: "Битрикс24", provider: "bitrix24", auth_secret: "key" },
    ]);
    mockSqlConnectors.mockResolvedValue([
      {
        id: 3,
        name: "Склад",
        engine: "postgresql",
        connection_string: "key",
      },
    ]);
    mockDecrypt.mockReturnValue(null);

    const result = await verifyEncryptedSecrets();

    expect(result.unreadable).toEqual([
      'bitrix24 "Битрикс24" (id 7)',
      'postgresql "Склад" (id 3)',
    ]);
  });
});

describe("rememberVectorSignature", () => {
  it("writes the signature once per process configuration", async () => {
    process.env.EMBEDDING_ENGINE = "openai";
    process.env.EMBEDDING_MODEL_PREF = "text-embedding-3-small";

    await rememberVectorSignature();
    await rememberVectorSignature();

    expect(
      upsertedLabels().filter((label) => label === "vector_store_signature")
    ).toHaveLength(1);
  });
});
