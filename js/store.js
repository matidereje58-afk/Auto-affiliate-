/**
 * Local-first persistence.
 *
 * - `localStorage` keeps the whole workspace (sessions, files, plan, memory)
 *   so the app is instant and works offline.
 * - When the user is signed in, `puter.kv` gets a mirror of the workspace so
 *   projects survive a browser wipe and follow the user across devices.
 * - Generated files are written through to Puter's cloud FS by the agent tools
 *   (`~/WorkBuddy/<project>/…`), which makes them real, downloadable artefacts.
 */

const STORAGE_KEY = 'workbuddy.state.v2';
const MAX_MESSAGES = 400;

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function createProject(name = 'Untitled project') {
  return {
    id: uid(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    modelId: null,
    level: null,
    messages: [],
    history: [],
    usage: { input: 0, output: 0, cost: 0 },
    files: {},
    plan: [],
    memory: [],
    checkpoints: [],
  };
}

export const DEFAULT_SETTINGS = {
  modelId: 'anthropic/claude-opus-5-5',
  level: 'medium',
  mode: 'agent',
  temperature: null,
  maxSteps: 40,
  autoContinue: true,
  webSearch: false,
  autoApprove: false,
  compaction: true,
};

export class Store extends EventTarget {
  constructor() {
    super();
    this.state = this.load();
    this.saveTimer = null;
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.projects?.length) {
          return {
            projects: parsed.projects,
            activeProjectId: parsed.activeProjectId ?? parsed.projects[0].id,
            settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
            modelVerifications: parsed.modelVerifications ?? {},
          };
        }
      }
    } catch (error) {
      console.warn('could not read saved workspace', error);
    }
    const project = createProject('Welcome project');
    return {
      projects: [project],
      activeProjectId: project.id,
      settings: { ...DEFAULT_SETTINGS },
      modelVerifications: {},
    };
  }

  get settings() {
    return this.state.settings;
  }

  get project() {
    return this.state.projects.find((p) => p.id === this.state.activeProjectId) ?? this.state.projects[0];
  }

  get verifications() {
    return this.state.modelVerifications;
  }

  updateSettings(patch) {
    this.state.settings = { ...this.state.settings, ...patch };
    this.project.updatedAt = Date.now();
    this.emit();
    this.save();
  }

  createProject(name) {
    const project = createProject(name || `Project ${this.state.projects.length + 1}`);
    project.modelId = this.settings.modelId;
    project.level = this.settings.level;
    this.state.projects.unshift(project);
    this.state.activeProjectId = project.id;
    this.emit();
    this.save();
    return project;
  }

  selectProject(id) {
    if (!this.state.projects.some((p) => p.id === id)) return;
    this.state.activeProjectId = id;
    this.emit();
    this.save();
  }

  deleteProject(id) {
    this.state.projects = this.state.projects.filter((p) => p.id !== id);
    if (!this.state.projects.length) this.state.projects.push(createProject());
    if (!this.state.projects.some((p) => p.id === this.state.activeProjectId)) {
      this.state.activeProjectId = this.state.projects[0].id;
    }
    this.emit();
    this.save();
  }

  renameProject(id, name) {
    const project = this.state.projects.find((p) => p.id === id);
    if (!project) return;
    project.name = name.trim() || project.name;
    project.updatedAt = Date.now();
    this.emit();
    this.save();
  }
  // ----------------------------------------------------------- messages ----
  addMessage(message) {
    const project = this.project;
    project.messages.push({ id: uid(), createdAt: Date.now(), ...message });
    if (project.messages.length > MAX_MESSAGES) {
      project.messages.splice(0, project.messages.length - MAX_MESSAGES);
    }
    project.updatedAt = Date.now();
    this.emit('message');
    this.save();
  }

  updateMessage(id, patch) {
    const project = this.project;
    const index = project.messages.findIndex((m) => m.id === id);
    if (index === -1) return null;
    project.messages[index] = { ...project.messages[index], ...patch };
    project.updatedAt = Date.now();
    this.save();
    return project.messages[index];
  }

  clearMessages() {
    this.project.messages = [];
    this.emit('message');
    this.save();
  }

  // -------------------------------------------------------------- files ----
  writeFile(path, content) {
    const project = this.project;
    project.files[path] = { content, updatedAt: Date.now() };
    project.updatedAt = Date.now();
    this.emit('files');
    this.save();
  }

  readFile(path) {
    return this.project.files[path]?.content ?? null;
  }

  deleteFile(path) {
    delete this.project.files[path];
    this.emit('files');
    this.save();
  }

  listFiles() {
    return Object.keys(this.project.files).sort();
  }

  /** Snapshot all files so a bad agent edit can be rolled back. */
  checkpoint(label = 'checkpoint') {
    const project = this.project;
    const snapshot = {
      id: uid(),
      label,
      createdAt: Date.now(),
      files: JSON.parse(JSON.stringify(project.files)),
    };
    project.checkpoints.unshift(snapshot);
    project.checkpoints = project.checkpoints.slice(0, 25);
    this.save();
    return snapshot;
  }

  restoreCheckpoint(id) {
    const project = this.project;
    const snapshot = project.checkpoints.find((c) => c.id === id);
    if (!snapshot) return false;
    project.files = JSON.parse(JSON.stringify(snapshot.files));
    this.emit('files');
    this.save();
    return true;
  }

  // ------------------------------------------------------- plan/memory ----
  setPlan(tasks) {
    this.project.plan = Array.isArray(tasks) ? tasks : [];
    this.emit('plan');
    this.save();
  }

  addMemory(fact) {
    if (!fact) return;
    const project = this.project;
    if (project.memory.some((m) => m.text === fact)) return;
    project.memory.push({ text: fact, at: Date.now() });
    project.memory = project.memory.slice(-100);
    this.emit('plan');
    this.save();
  }

  // ---------------------------------------------------- verification log ----
  setVerification(key, value) {
    this.state.modelVerifications[key] = { ...value, at: Date.now() };
    this.emit('verification');
    this.save();
  }

  getVerification(key) {
    return this.state.modelVerifications[key] ?? null;
  }

  // ------------------------------------------------------------ persist ----
  emit(kind = 'state') {
    this.dispatchEvent(new CustomEvent('change', { detail: { kind } }));
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 250);
  }

  async flush() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.warn('workspace too large for localStorage', error);
    }
    if (window.puter?.kv && window.puter?.auth?.isSignedIn?.()) {
      try {
        await window.puter.kv.set('workbuddy:workspace', JSON.stringify({
          projects: this.state.projects,
          activeProjectId: this.state.activeProjectId,
          settings: this.state.settings,
        }));
      } catch {
        /* kv mirror is best-effort */
      }
    }
  }

  exportProject() {
    const project = this.project;
    return JSON.stringify(
      { name: project.name, files: project.files, plan: project.plan, memory: project.memory },
      null,
      2,
    );
  }
}

export const store = new Store();