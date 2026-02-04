const Store = require('electron-store').default || require('electron-store');
const { randomUUID } = require('crypto');

const DEFAULT_ASSISTANTS = [
  {
    _id: 'local-general',
    id: 'local-general',
    name: 'General',
    role: 'General meeting assistant',
    description: 'A helpful assistant for any meeting.',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
];

const makeId = () => {
  if (typeof randomUUID === 'function') {
    return randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

class LocalAssistantStore {
  constructor() {
    this.store = new Store({ name: 'assistants' });
    this.ensureSeed();
  }

  ensureSeed() {
    const existing = this.store.get('assistants');
    if (!Array.isArray(existing) || existing.length === 0) {
      this.store.set('assistants', DEFAULT_ASSISTANTS.map(item => ({ ...item })));
    }
  }

  getAll() {
    this.ensureSeed();
    const list = this.store.get('assistants', []);
    return Array.isArray(list) ? list : [];
  }

  list({ search = '', page = 0, pageSize = 10 } = {}) {
    const list = this.getAll();
    let filtered = list;

    if (search) {
      const query = search.toLowerCase();
      filtered = list.filter(item => {
        const name = (item.name || '').toLowerCase();
        const role = (item.role || '').toLowerCase();
        const description = (item.description || '').toLowerCase();
        return name.includes(query) || role.includes(query) || description.includes(query);
      });
    }

    const total = filtered.length;
    const start = Math.max(0, page * pageSize);
    const items = filtered.slice(start, start + pageSize);

    return {
      items,
      total,
      page,
      pageSize
    };
  }

  getById(id) {
    if (!id) return null;
    return this.getAll().find(item => item._id === id || item.id === id) || null;
  }

  saveAll(list) {
    this.store.set('assistants', list);
  }

  create({ name, role, description } = {}) {
    const now = Date.now();
    const assistant = {
      _id: makeId(),
      id: null,
      name: name || 'New Assistant',
      role: role || '',
      description: description || '',
      createdAt: now,
      updatedAt: now
    };
    assistant.id = assistant._id;

    const list = this.getAll();
    list.push(assistant);
    this.saveAll(list);
    return assistant;
  }

  update(id, patch = {}) {
    const list = this.getAll();
    const index = list.findIndex(item => item._id === id || item.id === id);
    if (index < 0) return null;

    const now = Date.now();
    const current = list[index];
    const updated = {
      ...current,
      ...patch,
      _id: current._id,
      id: current.id || current._id,
      updatedAt: now
    };

    list[index] = updated;
    this.saveAll(list);
    return updated;
  }

  remove(id) {
    const list = this.getAll();
    const next = list.filter(item => !(item._id === id || item.id === id));
    if (next.length === list.length) {
      return false;
    }
    this.saveAll(next);
    return true;
  }
}

const localAssistantStore = new LocalAssistantStore();

module.exports = {
  LocalAssistantStore,
  localAssistantStore
};
