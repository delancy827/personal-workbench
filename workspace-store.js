(function (global) {
  'use strict';

  var DATA_KEY = 'workbench_data';
  var ACTIVE_KEY = 'workbench_active_workspace';
  var LEGACY_MIGRATION_KEY = 'legacy_history_workspace_migrated';
  var LEGACY_HISTORY_WORKSPACE = 'sinopec-2027';
  var SCOPED_COLLECTIONS = ['focus_sessions', 'tasks', 'courses', 'notes', 'checkins', 'reviews', 'goals', 'workspace_states'];
  var ALL_COLLECTIONS = SCOPED_COLLECTIONS.concat(['knowledge_items']);
  var DEFAULT_WORKSPACES = [
    {
      client_id: 'personal',
      name: '个人工作台',
      type: 'personal',
      status: 'active',
      description: '长期使用的个人学习、工作和生活空间',
      updated_at: '2026-07-01T00:00:00.000Z'
    },
    {
      client_id: 'sinopec-2027',
      name: '2027中石化备考',
      type: 'project',
      status: 'active',
      description: '中国石化2027届校园招聘备考工作空间',
      target: '中国石化校园招聘 → 茂名石化',
      recruitment_year: 2027,
      updated_at: '2026-08-16T00:00:00.000Z'
    }
  ];

  function now() { return new Date().toISOString(); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function isArray(value) { return Array.isArray(value); }

  function normalizeRecord(record, collection) {
    var item = Object.assign({}, record || {});
    if (SCOPED_COLLECTIONS.indexOf(collection) >= 0 && !item.workspace_id) item.workspace_id = LEGACY_HISTORY_WORKSPACE;
    if (collection === 'focus_sessions') {
      if (item.content == null) item.content = item.note || '';
      if (!item.analysis_status) item.analysis_status = item.content ? 'pending' : 'not_started';
      if (!item.visibility) item.visibility = 'private';
    }
    if (collection === 'knowledge_items') {
      if (!item.workspace_id) item.workspace_id = 'sinopec-2027';
      if (!item.visibility) item.visibility = 'public';
      if (!item.status) item.status = 'active';
      if (!item.version) item.version = 1;
    }
    return item;
  }

  function normalize(raw) {
    var data = raw && typeof raw === 'object' ? raw : {};
    var changed = !raw || typeof raw !== 'object';
    var version = Number(data.version) || 1;
    if (version < 2) { data.version = 2; changed = true; }

    ALL_COLLECTIONS.forEach(function (key) {
      if (!isArray(data[key])) { data[key] = []; changed = true; }
      var normalized = data[key].map(function (record) { return normalizeRecord(record, key); });
      if (JSON.stringify(normalized) !== JSON.stringify(data[key])) changed = true;
      data[key] = normalized;
    });

    if (!data.settings || typeof data.settings !== 'object') { data.settings = {}; changed = true; }
    if (!data.meta || typeof data.meta !== 'object') { data.meta = {}; changed = true; }
    if (!isArray(data.workspaces)) { data.workspaces = []; changed = true; }

    // The user confirmed that all records created before workspaces existed belong to the first project.
    if (data.meta[LEGACY_MIGRATION_KEY] !== LEGACY_HISTORY_WORKSPACE) {
      SCOPED_COLLECTIONS.forEach(function (key) {
        data[key].forEach(function (item) {
          if (!item.workspace_id || item.workspace_id === 'personal') {
            item.workspace_id = LEGACY_HISTORY_WORKSPACE;
            changed = true;
          }
        });
      });
      data.meta[LEGACY_MIGRATION_KEY] = LEGACY_HISTORY_WORKSPACE;
      data.meta.legacy_history_migrated_at = now();
      changed = true;
    }

    DEFAULT_WORKSPACES.forEach(function (workspace) {
      var existing = data.workspaces.find(function (item) { return item.client_id === workspace.client_id; });
      if (!existing) { data.workspaces.push(clone(workspace)); changed = true; }
    });

    if (global.PERSONAL_WORKBENCH_KNOWLEDGE) {
      global.PERSONAL_WORKBENCH_KNOWLEDGE.forEach(function (seed) {
        if (!data.knowledge_items.some(function (item) { return item.client_id === seed.client_id; })) {
          data.knowledge_items.push(Object.assign({}, clone(seed), {
            workspace_id: seed.workspace_id || 'sinopec-2027',
            updated_at: seed.updated_at || now()
          }));
          changed = true;
        }
      });
    }

    return { data: data, changed: changed };
  }

  function loadFull() {
    var raw = localStorage.getItem(DATA_KEY);
    var parsed = {};
    try { parsed = raw ? JSON.parse(raw) : {}; } catch (error) { parsed = {}; }
    var result = normalize(parsed);
    if (result.changed || !raw) saveFull(result.data);
    return result.data;
  }

  function saveFull(data) {
    var normalized = normalize(clone(data)).data;
    localStorage.setItem(DATA_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function activeWorkspaceId() {
    var data = loadFull();
    var requested = localStorage.getItem(ACTIVE_KEY) || 'personal';
    if (data.workspaces.some(function (item) { return item.client_id === requested; })) return requested;
    localStorage.setItem(ACTIVE_KEY, 'personal');
    return 'personal';
  }

  function getActiveWorkspace() {
    var id = activeWorkspaceId();
    return loadFull().workspaces.find(function (item) { return item.client_id === id; });
  }

  function scopedData(data, workspaceId) {
    var result = clone(data);
    SCOPED_COLLECTIONS.forEach(function (key) {
      result[key] = (data[key] || []).filter(function (item) { return item.workspace_id === workspaceId; });
    });
    result.knowledge_items = (data.knowledge_items || []).filter(function (item) { return item.workspace_id === workspaceId; });
    result.active_workspace_id = workspaceId;
    return result;
  }

  function loadScoped() {
    var full = loadFull();
    return scopedData(full, activeWorkspaceId());
  }

  function saveScoped(scoped) {
    var full = loadFull();
    var workspaceId = activeWorkspaceId();
    SCOPED_COLLECTIONS.concat(['knowledge_items']).forEach(function (key) {
      var incoming = isArray(scoped[key]) ? scoped[key].map(function (item) {
        return normalizeRecord(Object.assign({}, item, { workspace_id: item.workspace_id || workspaceId }), key);
      }) : [];
      full[key] = (full[key] || []).filter(function (item) { return item.workspace_id !== workspaceId; }).concat(incoming);
    });
    if (scoped.settings) full.settings = scoped.settings;
    if (scoped.meta) full.meta = scoped.meta;
    return saveFull(full);
  }

  function setActiveWorkspace(workspaceId) {
    var data = loadFull();
    if (!data.workspaces.some(function (item) { return item.client_id === workspaceId; })) return false;
    localStorage.setItem(ACTIVE_KEY, workspaceId);
    return true;
  }

  function updateWorkspace(workspaceId, patch) {
    var data = loadFull();
    var workspace = data.workspaces.find(function (item) { return item.client_id === workspaceId; });
    if (!workspace) return null;
    Object.assign(workspace, patch || {}, { updated_at: now() });
    saveFull(data);
    return workspace;
  }

  function createWorkspace(name, type) {
    var trimmed = String(name || '').trim();
    if (!trimmed) return null;
    var data = loadFull();
    var id = 'workspace-' + Date.now().toString(36);
    var workspace = {
      client_id: id,
      name: trimmed,
      type: type || 'project',
      status: 'active',
      description: '',
      updated_at: now()
    };
    data.workspaces.push(workspace);
    saveFull(data);
    setActiveWorkspace(id);
    return workspace;
  }

  function setWorkspaceStatus(workspaceId, status) {
    if (workspaceId === 'personal' && status === 'archived') return false;
    return !!updateWorkspace(workspaceId, { status: status, archived_at: status === 'archived' ? now() : null });
  }

  global.WorkbenchStore = {
    DATA_KEY: DATA_KEY,
    SCOPED_COLLECTIONS: SCOPED_COLLECTIONS,
    ALL_COLLECTIONS: ALL_COLLECTIONS,
    normalize: normalize,
    loadFull: loadFull,
    saveFull: saveFull,
    loadScoped: loadScoped,
    saveScoped: saveScoped,
    activeWorkspaceId: activeWorkspaceId,
    getActiveWorkspace: getActiveWorkspace,
    setActiveWorkspace: setActiveWorkspace,
    updateWorkspace: updateWorkspace,
    createWorkspace: createWorkspace,
    setWorkspaceStatus: setWorkspaceStatus
  };
})(window);
