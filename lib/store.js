// Local persistence: settings, conversation history, long-term memory, artifacts index.

import { uid } from './util.js';

const LS_SETTINGS = 'atria.settings.v1';
const LS_CONVS = 'atria.conversations.v1';
const LS_MEMORY = 'atria.memory.v1';

// The API key the user supplied for this deployment. Users can replace it in Settings,
// which is stored in this browser only.
export const DEFAULT_API_KEY = 'atr_dBpO39lIumBSDNnrewHhKZMWxV_Hbhzk';

export const DEFAULT_SETTINGS = {
  apiKey: DEFAULT_API_KEY,
  baseUrl: 'https://api.atria-asi.ai/v1',
  model: 'Atria-Dawn-Preview',
  reasoningEffort: 'medium',
  maxSteps: 25,
  maxTokens: 16384,
  temperature: null,
  systemPrompt: '',
  enableSubagents: true,
  autoOpenArtifacts: true,
  theme: 'dark',
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch { return fallback; }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn('storage full', e); }
}

// A key can also be supplied through the URL hash, e.g. #key=atr_xxx (never stored).
function keyFromHash() {
  const m = /(?:^|[#&])key=([^&]+)/.exec(location.hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

export const settings = {
  data: { ...DEFAULT_SETTINGS },

  load() {
    const stored = readJson(LS_SETTINGS, {});
    this.data = { ...DEFAULT_SETTINGS, ...stored };
    const hashKey = keyFromHash();
    if (hashKey) this.data.apiKey = hashKey;
    return this.data;
  },

  save(patch = {}) {
    this.data = { ...this.data, ...patch };
    const { apiKey, baseUrl, model, reasoningEffort, maxSteps, maxTokens, temperature, systemPrompt, enableSubagents, autoOpenArtifacts, theme } = this.data;
    writeJson(LS_SETTINGS, { apiKey, baseUrl, model, reasoningEffort, maxSteps, maxTokens, temperature, systemPrompt, enableSubagents, autoOpenArtifacts, theme });
    return this.data;
  },
};

export const conversations = {
  all() { return readJson(LS_CONVS, []); },

  save(conv) {
    const list = this.all().filter((c) => c.id !== conv.id);
    const trimmed = {
      id: conv.id,
      title: conv.title || 'Untitled',
      createdAt: conv.createdAt || Date.now(),
      updatedAt: Date.now(),
      messages: conv.messages,
      usage: conv.usage,
    };
    list.unshift(trimmed);
    writeJson(LS_CONVS, list.slice(0, 40));
    return trimmed;
  },

  get(id) { return this.all().find((c) => c.id === id) || null; },

  remove(id) {
    writeJson(LS_CONVS, this.all().filter((c) => c.id !== id));
  },

  clear() { writeJson(LS_CONVS, []); },
};

export const memory = {
  all() { return readJson(LS_MEMORY, {}); },
  async set(key, value) {
    const all = this.all();
    all[String(key)] = value;
    writeJson(LS_MEMORY, all);
  },
  async get(key) { return this.all()[String(key)]; },
  async delete(key) {
    const all = this.all();
    delete all[String(key)];
    writeJson(LS_MEMORY, all);
  },
  async clear() { writeJson(LS_MEMORY, {}); },
};

/** Only meaningful keys are sent to the model. */
export function memoryForPrompt() {
  const all = memory.all();
  const out = {};
  for (const k of Object.keys(all).slice(0, 60)) out[k] = String(all[k]).slice(0, 500);
  return out;
}

export const newConversation = () => ({
  id: uid('conv'),
  title: 'New conversation',
  createdAt: Date.now(),
  messages: [],
  usage: { prompt: 0, completion: 0, steps: 0 },
});