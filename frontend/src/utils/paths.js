import { API_BASE } from "./constants";

const PRODUCT_PAGE = "https://www.interstorm.ru/interstormllm";

/**
 * Check if a href matches the current pathname.
 * Matches exactly or as a parent path (e.g. /settings/model-routers matches /settings/model-routers/1).
 */
export function isPathMatch(href, pathname) {
  return pathname === href || pathname.startsWith(href + "/");
}

function applyOptions(path, options = {}) {
  let updatedPath = path;
  if (!options || Object.keys(options).length === 0) return updatedPath;

  if (options.search) {
    const searchParams = new URLSearchParams(options.search);
    updatedPath += `?${searchParams.toString()}`;
  }
  return updatedPath;
}

export default {
  home: () => {
    return "/";
  },
  login: (noTry = false) => {
    return `/login${noTry ? "?nt=1" : ""}`;
  },
  sso: {
    login: () => {
      return "/sso/simple";
    },
  },
  onboarding: {
    home: () => {
      return "/onboarding";
    },
    survey: () => {
      return "/onboarding/survey";
    },
    llmPreference: () => {
      return "/onboarding/llm-preference";
    },
    embeddingPreference: () => {
      return "/onboarding/embedding-preference";
    },
    vectorDatabase: () => {
      return "/onboarding/vector-database";
    },
    userSetup: () => {
      return "/onboarding/user-setup";
    },
    dataHandling: () => {
      return "/onboarding/data-handling";
    },
  },
  // Single source of truth for every outbound brand link. Nothing here should
  // ever point at Mintplex Labs infrastructure.
  site: () => {
    return "https://interstorm.ru/";
  },
  product: () => {
    return PRODUCT_PAGE;
  },
  communityChat: () => {
    return "https://t.me/chupritski";
  },
  // Legacy name kept so existing call sites resolve to our own docs surface.
  docs: () => {
    return PRODUCT_PAGE;
  },
  chatModes: () => {
    return PRODUCT_PAGE;
  },
  mailToSupport: () => {
    return "mailto:hello@interstorm.ru";
  },
  hosting: () => {
    return PRODUCT_PAGE;
  },
  workspace: {
    chat: (slug, options = {}) => {
      return applyOptions(`/workspace/${slug}`, options);
    },
    settings: {
      generalAppearance: (slug) => {
        return `/workspace/${slug}/settings/general-appearance`;
      },
      chatSettings: function (slug, options = {}) {
        return applyOptions(
          `/workspace/${slug}/settings/chat-settings`,
          options
        );
      },
      vectorDatabase: (slug) => {
        return `/workspace/${slug}/settings/vector-database`;
      },
      members: (slug) => {
        return `/workspace/${slug}/settings/members`;
      },
      agentConfig: (slug) => {
        return `/workspace/${slug}/settings/agent-config`;
      },
      dataConnectors: (slug) => {
        return `/workspace/${slug}/settings/data-connectors`;
      },
    },
    thread: (wsSlug, threadSlug) => {
      return `/workspace/${wsSlug}/t/${threadSlug}`;
    },
  },
  apiDocs: () => {
    return `${API_BASE}/docs`;
  },
  settings: {
    dashboard: () => {
      return `/settings/dashboard`;
    },
    users: () => {
      return `/settings/users`;
    },
    invites: () => {
      return `/settings/invites`;
    },
    workspaces: () => {
      return `/settings/workspaces`;
    },
    chats: () => {
      return "/settings/workspace-chats";
    },
    llmPreference: () => {
      return "/settings/llm-preference";
    },
    transcriptionPreference: () => {
      return "/settings/transcription-preference";
    },
    audioPreference: () => {
      return "/settings/audio-preference";
    },
    defaultSystemPrompt: () => {
      return "/settings/default-system-prompt";
    },
    embedder: {
      modelPreference: () => "/settings/embedding-preference",
      chunkingPreference: () => "/settings/text-splitter-preference",
    },
    embeddingPreference: () => {
      return "/settings/embedding-preference";
    },
    imageGenerationPreference: () => {
      return "/settings/image-generation-preference";
    },
    vectorDatabase: () => {
      return "/settings/vector-database";
    },
    security: () => {
      return "/settings/security";
    },
    interface: () => {
      return "/settings/interface";
    },
    branding: () => {
      return "/settings/branding";
    },
    agentSkills: () => {
      return "/settings/agents";
    },
    chat: () => {
      return "/settings/chat";
    },
    apiKeys: () => {
      return "/settings/api-keys";
    },
    modelRouters: () => {
      return "/settings/model-routers";
    },
    modelRouterRules: (id) => {
      return `/settings/model-routers/${id}`;
    },
    systemPromptVariables: () => "/settings/system-prompt-variables",
    logs: () => {
      return "/settings/event-logs";
    },
    privacy: () => {
      return "/settings/privacy";
    },
    embedChatWidgets: () => {
      return `/settings/embed-chat-widgets`;
    },
    browserExtension: () => {
      return `/settings/browser-extension`;
    },
    mobile: () => {
      return `/settings/mobile-connections`;
    },
    experimental: () => {
      return `/settings/beta-features`;
    },
    mobileConnections: () => {
      return `/settings/mobile-connections`;
    },
    telegram: () => {
      return `/settings/external-connections/telegram`;
    },
    scheduledJobs: () => {
      return `/settings/scheduled-jobs`;
    },
    scheduledJobRuns: (jobId) => {
      return `/settings/scheduled-jobs/${jobId}/runs`;
    },
    scheduledJobRunDetail: (jobId, runId) => {
      return `/settings/scheduled-jobs/${jobId}/runs/${runId}`;
    },
  },
  agents: {
    builder: () => {
      return `/settings/agents/builder`;
    },
    editAgent: (uuid) => {
      return `/settings/agents/builder/${uuid}`;
    },
  },
  communityHub: {
    website: () => {
      return PRODUCT_PAGE;
    },
    /**
     * View more items of a given type on the community hub.
     * @param {string} type - The type of items to view more of. Should be kebab-case.
     * @returns {string} The path to view more items of the given type.
     */
    viewMoreOfType: function () {
      return PRODUCT_PAGE;
    },
    viewItem: function () {
      return PRODUCT_PAGE;
    },
    trending: () => {
      return `/settings/community-hub/trending`;
    },
    authentication: () => {
      return `/settings/community-hub/authentication`;
    },
    importItem: (importItemId) => {
      return `/settings/community-hub/import-item${importItemId ? `?id=${importItemId}` : ""}`;
    },
    profile: function () {
      return PRODUCT_PAGE;
    },
    noPrivateItems: () => {
      return PRODUCT_PAGE;
    },
  },

  documentation: {
    mobileIntroduction: () => {
      return PRODUCT_PAGE;
    },
    contextWindows: () => {
      return PRODUCT_PAGE;
    },
  },

  experimental: {
    liveDocumentSync: {
      manage: () => `/settings/beta-features/live-document-sync/manage`,
    },
  },
};
