// Application State
const state = {
  topics: [],
  activeTopicId: null,
  branches: [],
  activeNodeId: null,
  searchQuery: '',
  dbConnected: false
};

// DOM Elements
const el = {
  topicsList: document.getElementById('topics-list'),
  searchTopics: document.getElementById('search-topics'),
  newTopicBtn: document.getElementById('new-topic-btn'),
  welcomeNewTopicBtn: document.getElementById('welcome-new-topic-btn'),
  dbStatus: document.getElementById('db-status'),
  welcomeScreen: document.getElementById('welcome-screen'),
  activeWorkspace: document.getElementById('active-workspace'),
  activeTopicTitle: document.getElementById('active-topic-title'),
  editTopicTitleBtn: document.getElementById('edit-topic-title-btn'),
  addRootBranchBtn: document.getElementById('add-root-branch-btn'),
  deleteTopicBtn: document.getElementById('delete-topic-btn'),
  treeRoot: document.getElementById('tree-root'),
  detailsPanel: document.getElementById('details-panel'),
  closePanelBtn: document.getElementById('close-panel-btn'),
  editNodeId: document.getElementById('edit-node-id'),
  editNodeTitle: document.getElementById('edit-node-title'),
  editNodeDescription: document.getElementById('edit-node-description'),
  saveNodeBtn: document.getElementById('save-node-btn'),
  deleteNodeBtn: document.getElementById('delete-node-btn'),
  saveStatus: document.getElementById('save-status'),
  topicModal: document.getElementById('topic-modal'),
  modalTitle: document.getElementById('modal-title'),
  modalTopicId: document.getElementById('modal-topic-id'),
  modalTopicTitle: document.getElementById('modal-topic-title'),
  modalCloseBtn: document.getElementById('modal-close-btn'),
  modalCancelBtn: document.getElementById('modal-cancel-btn'),
  modalSubmitBtn: document.getElementById('modal-submit-btn'),
  branchModal: document.getElementById('branch-modal'),
  branchModalTitle: document.getElementById('branch-modal-title'),
  branchModalParentId: document.getElementById('branch-modal-parent-id'),
  branchModalParentIndicator: document.getElementById('branch-modal-parent-indicator'),
  branchModalInput: document.getElementById('branch-modal-input'),
  branchModalCloseBtn: document.getElementById('branch-modal-close-btn'),
  branchModalCancelBtn: document.getElementById('branch-modal-cancel-btn'),
  branchModalSubmitBtn: document.getElementById('branch-modal-submit-btn'),
  branchPreviewCount: document.getElementById('branch-preview-count'),
  branchPreviewTree: document.getElementById('branch-preview-tree')
};

//
// API Base URL (defaults to relative path for production, localhost for dev)
const API_URL = '';

// Helper: Escape HTML to prevent XSS
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ----------------------------------------------------
// DATABASE STATUS & INITIALIZATION
// ----------------------------------------------------
async function checkDatabaseStatus() {
  try {
    const response = await fetch(`${API_URL}/api/topics`);
    if (response.ok) {
      setDbStatus(true, 'Connected to MySQL');
      return true;
    } else {
      const data = await response.json();
      setDbStatus(false, data.error || 'Server error');
      return false;
    }
  } catch (error) {
    setDbStatus(false, 'Database offline');
    return false;
  }
}

function setDbStatus(connected, message) {
  state.dbConnected = connected;
  const dot = el.dbStatus.querySelector('.status-dot');
  const text = el.dbStatus.querySelector('.status-text');
  
  if (connected) {
    dot.className = 'status-dot status-online';
    text.textContent = message;
  } else {
    dot.className = 'status-dot status-offline';
    text.textContent = message;
  }
}

// ----------------------------------------------------
// TOPIC ACTIONS
// ----------------------------------------------------
async function fetchTopics() {
  try {
    const response = await fetch(`${API_URL}/api/topics`);
    if (response.ok) {
      state.topics = await response.json();
      setDbStatus(true, 'Connected to MySQL');
      renderTopicsList();
    } else {
      const data = await response.json();
      setDbStatus(false, data.error || 'Failed to fetch topics');
    }
  } catch (err) {
    setDbStatus(false, 'Server offline');
    console.error('Error fetching topics:', err);
  }
}

function renderTopicsList() {
  const filtered = state.topics.filter(t => 
    t.title.toLowerCase().includes(state.searchQuery.toLowerCase())
  );
  
  if (filtered.length === 0) {
    el.topicsList.innerHTML = `<li class="empty-item">${state.searchQuery ? 'Topik tidak ditemukan' : 'Belum ada topik'}</li>`;
    return;
  }

  el.topicsList.innerHTML = filtered.map(topic => `
    <li class="topic-item ${state.activeTopicId === topic.id ? 'active' : ''}" data-id="${topic.id}">
      <span class="topic-title" title="${escapeHTML(topic.title)}">${escapeHTML(topic.title)}</span>
      <div class="topic-actions">
        <button class="rename-topic-btn" data-id="${topic.id}" data-title="${escapeHTML(topic.title)}" title="Rename">
          <i data-lucide="edit-2" style="width: 14px; height: 14px;"></i>
        </button>
        <button class="delete-topic-btn" data-id="${topic.id}" title="Delete">
          <i data-lucide="trash" style="width: 14px; height: 14px;"></i>
        </button>
      </div>
    </li>
  `).join('');

  lucide.createIcons();
  
  // Attach event listeners to sidebar items
  document.querySelectorAll('.topic-item').forEach(item => {
    item.addEventListener('click', (e) => {
      // Ignore click if user clicked on action buttons
      if (e.target.closest('.topic-actions')) return;
      selectTopic(Number(item.dataset.id));
    });
  });

  document.querySelectorAll('.rename-topic-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTopicModal(Number(btn.dataset.id), btn.dataset.title);
    });
  });

  document.querySelectorAll('.delete-topic-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      if (confirm('Apakah Anda yakin ingin menghapus topik ini beserta seluruh cabangnya?')) {
        await deleteTopic(id);
      }
    });
  });
}

async function createTopic(title) {
  try {
    const response = await fetch(`${API_URL}/api/topics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    
    if (response.ok) {
      const newTopic = await response.json();
      await fetchTopics();
      // Auto select the new topic
      selectTopic(newTopic.id);
    } else {
      alert('Gagal membuat topik');
    }
  } catch (err) {
    console.error('Error creating topic:', err);
  }
}

async function renameTopic(id, title) {
  try {
    const response = await fetch(`${API_URL}/api/topics/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    
    if (response.ok) {
      await fetchTopics();
      if (state.activeTopicId === id) {
        el.activeTopicTitle.textContent = title;
      }
    } else {
      alert('Gagal mengubah nama topik');
    }
  } catch (err) {
    console.error('Error renaming topic:', err);
  }
}

async function deleteTopic(id) {
  try {
    const response = await fetch(`${API_URL}/api/topics/${id}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      if (state.activeTopicId === id) {
        state.activeTopicId = null;
        state.branches = [];
        state.activeNodeId = null;
        closeDetailsPanel();
        updateWorkspaceView();
      }
      await fetchTopics();
    } else {
      alert('Gagal menghapus topik');
    }
  } catch (err) {
    console.error('Error deleting topic:', err);
  }
}

function selectTopic(id) {
  state.activeTopicId = id;
  const activeTopic = state.topics.find(t => t.id === id);
  if (activeTopic) {
    el.activeTopicTitle.textContent = activeTopic.title;
    closeDetailsPanel();
    state.activeNodeId = null;
    fetchBranches(id);
    renderTopicsList(); // Update highlight
  }
}

function updateWorkspaceView() {
  if (state.activeTopicId) {
    el.welcomeScreen.classList.add('hidden');
    el.activeWorkspace.classList.remove('hidden');
  } else {
    el.welcomeScreen.classList.remove('hidden');
    el.activeWorkspace.classList.add('hidden');
  }
}

// ----------------------------------------------------
// BRANCH ACTIONS
// ----------------------------------------------------
async function fetchBranches(topicId) {
  try {
    const response = await fetch(`${API_URL}/api/topics/${topicId}/branches`);
    if (response.ok) {
      state.branches = await response.json();
      updateWorkspaceView();
      renderTree();
    } else {
      console.error('Failed to fetch branches');
    }
  } catch (err) {
    console.error('Error fetching branches:', err);
  }
}

function renderTree() {
  el.treeRoot.innerHTML = '';
  
  // Root branches have parent_id === null
  const rootBranches = state.branches.filter(b => b.parent_id === null);
  
  if (rootBranches.length === 0) {
    el.treeRoot.innerHTML = `
      <div class="empty-tree-state" style="padding: 3rem 0; text-align: center; color: var(--text-muted);">
        <i data-lucide="git-commit" style="width: 2.5rem; height: 2.5rem; color: var(--border-color-dark); margin-bottom: 0.5rem;"></i>
        <p>Belum ada cabang di topik ini.</p>
        <button id="canvas-add-first-btn" class="btn btn-secondary btn-sm" style="margin-top: 0.75rem;">
          <i data-lucide="plus"></i> Tambah Cabang Pertama
        </button>
      </div>
    `;
    lucide.createIcons();
    
    document.getElementById('canvas-add-first-btn')?.addEventListener('click', () => {
      openBranchModal(null);
    });
    return;
  }

  const ul = document.createElement('ul');
  rootBranches.forEach(branch => {
    ul.appendChild(renderNodeDOM(branch));
  });
  el.treeRoot.appendChild(ul);
  lucide.createIcons();
}

function renderNodeDOM(node) {
  const children = state.branches.filter(b => b.parent_id === node.id);
  const isExpanded = node.is_expanded === 1 || node.is_expanded === true;
  
  const li = document.createElement('li');
  li.dataset.id = node.id;
  
  const card = document.createElement('div');
  card.className = `tree-node-card ${state.activeNodeId === node.id ? 'selected' : ''}`;
  card.dataset.id = node.id;
  
  // Collapse/Expand button setup
  const hasChildren = children.length > 0;
  let toggleBtnHtml = '';
  if (hasChildren) {
    const arrowDirectionClass = isExpanded ? '' : 'rotated';
    toggleBtnHtml = `<button class="node-toggle-btn ${arrowDirectionClass}" data-action="toggle" title="${isExpanded ? 'Collapse' : 'Expand'}"><i data-lucide="chevron-down"></i></button>`;
  } else {
    toggleBtnHtml = `<div style="width: 22px;"></div>`;
  }
  
  // Notes indicators
  const hasDesc = node.description && node.description.trim().length > 0;
  const docIconHtml = hasDesc 
    ? `<i data-lucide="file-text" class="indicator-icon has-desc" title="Memiliki deskripsi"></i>` 
    : '';
  
  card.innerHTML = `
    ${toggleBtnHtml}
    <div class="node-content" data-action="select" title="Klik untuk mengedit cabang">${escapeHTML(node.title)}</div>
    <div class="node-indicators">${docIconHtml}</div>
    <div class="node-actions">
      <button class="node-action-btn add-btn" data-action="add-child" title="Tambah sub-cabang"><i data-lucide="plus"></i></button>
      <button class="node-action-btn edit-btn" data-action="select" title="Edit deskripsi & judul"><i data-lucide="edit-3"></i></button>
      <button class="node-action-btn delete-btn" data-action="delete" title="Hapus cabang"><i data-lucide="trash-2"></i></button>
    </div>
  `;
  
  li.appendChild(card);
  
  // Recursive children render
  if (hasChildren && isExpanded) {
    const childrenUl = document.createElement('ul');
    children.forEach(child => {
      childrenUl.appendChild(renderNodeDOM(child));
    });
    li.appendChild(childrenUl);
  }
  
  // Attach event handlers inside the node card
  card.addEventListener('click', async (e) => {
    const actionElement = e.target.closest('[data-action]');
    if (!actionElement) return;
    
    const action = actionElement.dataset.action;
    
    if (action === 'toggle') {
      e.stopPropagation();
      await toggleBranchExpand(node.id, !isExpanded);
    } else if (action === 'select') {
      e.stopPropagation();
      selectNodeForEdit(node.id);
    } else if (action === 'add-child') {
      e.stopPropagation();
      openBranchModal(node.id);
    } else if (action === 'delete') {
      e.stopPropagation();
      if (confirm(`Apakah Anda yakin ingin menghapus cabang "${node.title}" beserta sub-cabangnya?`)) {
        await deleteBranch(node.id);
      }
    }
  });

  return li;
}

async function addBranch(parentId = null) {
  if (!state.activeTopicId) return;
  
  try {
    const response = await fetch(`${API_URL}/api/branches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic_id: state.activeTopicId,
        parent_id: parentId,
        title: 'Cabang Baru',
        description: ''
      })
    });
    
    if (response.ok) {
      const newBranch = await response.json();
      
      // If we added a child under a collapsed node, we should expand the parent first
      if (parentId) {
        const parentNode = state.branches.find(b => b.id === parentId);
        if (parentNode && parentNode.is_expanded === 0) {
          await toggleBranchExpand(parentId, true, false); // Toggle silent without full refresh
        }
      }

      await fetchBranches(state.activeTopicId);
      
      // Automatically select and edit the newly created node
      selectNodeForEdit(newBranch.id);
    } else {
      alert('Gagal menambah cabang');
    }
  } catch (err) {
    console.error('Error adding branch:', err);
  }
}

// ----------------------------------------------------
// BULK BRANCH ACTIONS (MULTIPLE & NESTED INPUT)
// ----------------------------------------------------
function parseOutline(text, baseParentId = null) {
  const lines = text.split('\n');
  const items = [];
  const stack = [{ indent: -1, dbParentId: baseParentId, tempId: 'base' }];
  
  let tempIdCounter = 0;
  
  for (let line of lines) {
    const match = line.match(/^(\s*)(.*)/);
    if (!match) continue;
    
    let indentStr = match[1];
    let content = match[2].trim();
    
    if (!content) continue;
    
    // Strip leading list symbols like -, *, +
    content = content.replace(/^[-*+]\s+/, '');
    if (!content) continue;
    
    const normalizedIndent = indentStr.replace(/\t/g, '  ').length;
    
    while (stack.length > 1 && stack[stack.length - 1].indent >= normalizedIndent) {
      stack.pop();
    }
    
    const parent = stack[stack.length - 1];
    const currentTempId = `temp_${tempIdCounter++}`;
    
    const item = {
      tempId: currentTempId,
      parentTempId: parent.tempId === 'base' ? null : parent.tempId,
      dbParentId: parent.tempId === 'base' ? parent.dbParentId : null,
      title: content
    };
    
    items.push(item);
    stack.push({ indent: normalizedIndent, tempId: currentTempId, dbParentId: null });
  }
  
  return items;
}

function updateBranchPreview() {
  const text = el.branchModalInput.value;
  const parsed = parseOutline(text, null);
  
  if (parsed.length === 0) {
    el.branchPreviewCount.textContent = '0';
    el.branchPreviewTree.innerHTML = '<span class="preview-empty">Mulai mengetik untuk melihat pratinjau struktur...</span>';
    return;
  }
  
  el.branchPreviewCount.textContent = parsed.length;
  
  const tempIdToLevel = {};
  const html = parsed.map(item => {
    let level = 0;
    if (item.parentTempId && tempIdToLevel[item.parentTempId] !== undefined) {
      level = tempIdToLevel[item.parentTempId] + 1;
    }
    tempIdToLevel[item.tempId] = level;
    
    const indentation = '  '.repeat(level);
    const prefix = level > 0 ? '└─ ' : '▪ ';
    
    return `<div class="preview-item">${indentation}<span class="preview-indent">${prefix}</span>${escapeHTML(item.title)}</div>`;
  }).join('');
  
  el.branchPreviewTree.innerHTML = html;
}

function openBranchModal(parentId = null) {
  el.branchModalParentId.value = parentId || '';
  el.branchModalInput.value = '';
  
  if (parentId) {
    const parentNode = state.branches.find(b => b.id === parentId);
    const parentTitle = parentNode ? parentNode.title : 'Cabang';
    el.branchModalParentIndicator.innerHTML = `Menambahkan sub-cabang di bawah: <strong>${escapeHTML(parentTitle)}</strong>`;
    el.branchModalTitle.textContent = 'Tambah Sub-cabang';
  } else {
    el.branchModalParentIndicator.innerHTML = `Menambahkan ke: <strong>Cabang Utama</strong>`;
    el.branchModalTitle.textContent = 'Tambah Cabang Utama';
  }
  
  updateBranchPreview();
  el.branchModal.classList.remove('hidden');
  el.branchModalInput.focus();
}

function closeBranchModal() {
  el.branchModal.classList.add('hidden');
  el.branchModalParentId.value = '';
  el.branchModalInput.value = '';
}

async function submitBranchModal() {
  const text = el.branchModalInput.value;
  const parentIdVal = el.branchModalParentId.value;
  const parentId = parentIdVal ? Number(parentIdVal) : null;
  
  const parsed = parseOutline(text, parentId);
  
  if (parsed.length === 0) {
    alert('Masukkan setidaknya satu nama cabang');
    return;
  }
  
  const originalText = el.branchModalSubmitBtn.textContent;
  el.branchModalSubmitBtn.disabled = true;
  el.branchModalSubmitBtn.textContent = 'Menambahkan...';
  
  try {
    const response = await fetch(`${API_URL}/api/branches/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic_id: state.activeTopicId,
        parent_id: parentId,
        branches: parsed
      })
    });
    
    if (response.ok) {
      const newBranches = await response.json();
      
      if (parentId) {
        const parentNode = state.branches.find(b => b.id === parentId);
        if (parentNode && parentNode.is_expanded === 0) {
          await toggleBranchExpand(parentId, true, false);
        }
      }
      
      closeBranchModal();
      await fetchBranches(state.activeTopicId);
      
      if (newBranches.length > 0) {
        selectNodeForEdit(newBranches[0].id);
      }
    } else {
      const errData = await response.json();
      alert('Gagal menambah cabang: ' + (errData.error || 'Terjadi kesalahan'));
    }
  } catch (err) {
    console.error('Error adding branches in bulk:', err);
    alert('Gagal menghubungi server.');
  } finally {
    el.branchModalSubmitBtn.disabled = false;
    el.branchModalSubmitBtn.textContent = originalText;
  }
}

async function toggleBranchExpand(id, expand, refresh = true) {
  try {
    const response = await fetch(`${API_URL}/api/branches/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_expanded: expand })
    });
    
    if (response.ok && refresh) {
      await fetchBranches(state.activeTopicId);
    }
  } catch (err) {
    console.error('Error toggling branch expand:', err);
  }
}

async function deleteBranch(id) {
  try {
    const response = await fetch(`${API_URL}/api/branches/${id}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      if (state.activeNodeId === id) {
        closeDetailsPanel();
      }
      await fetchBranches(state.activeTopicId);
    } else {
      alert('Gagal menghapus cabang');
    }
  } catch (err) {
    console.error('Error deleting branch:', err);
  }
}

// ----------------------------------------------------
// DETAILS PANEL (INSPECTOR)
// ----------------------------------------------------
function selectNodeForEdit(id) {
  state.activeNodeId = id;
  const node = state.branches.find(b => b.id === id);
  if (!node) return;
  
  // Highlight card
  document.querySelectorAll('.tree-node-card').forEach(card => {
    if (Number(card.dataset.id) === id) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });

  el.editNodeId.value = node.id;
  el.editNodeTitle.value = node.title;
  el.editNodeDescription.value = node.description || '';
  
  el.detailsPanel.classList.remove('closed');
  el.saveStatus.classList.remove('visible'); // hide autosaved badge initially
  
  // Focus title input
  el.editNodeTitle.focus();
  el.editNodeTitle.select();
}

function closeDetailsPanel() {
  state.activeNodeId = null;
  el.detailsPanel.classList.add('closed');
  document.querySelectorAll('.tree-node-card').forEach(card => {
    card.classList.remove('selected');
  });
}

async function saveActiveNodeChanges() {
  const id = Number(el.editNodeId.value);
  const title = el.editNodeTitle.value.trim();
  const description = el.editNodeDescription.value;
  
  if (!id) return;
  if (!title) {
    alert('Judul cabang tidak boleh kosong');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/branches/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description })
    });
    
    if (response.ok) {
      // Show success indicator
      el.saveStatus.classList.add('visible');
      setTimeout(() => {
        el.saveStatus.classList.remove('visible');
      }, 3000);
      
      // Update local state without full server fetch to keep UI responsive
      const nodeIndex = state.branches.findIndex(b => b.id === id);
      if (nodeIndex !== -1) {
        state.branches[nodeIndex].title = title;
        state.branches[nodeIndex].description = description;
      }
      
      renderTree();
    } else {
      alert('Gagal menyimpan perubahan cabang');
    }
  } catch (err) {
    console.error('Error saving branch details:', err);
  }
}

// ----------------------------------------------------
// MODAL FOR TOPIC MANAGEMENT
// ----------------------------------------------------
function openTopicModal(id = null, title = '') {
  el.modalTopicId.value = id || '';
  el.modalTopicTitle.value = title;
  
  if (id) {
    el.modalTitle.textContent = 'Edit Nama Topik';
    el.modalSubmitBtn.textContent = 'Simpan';
  } else {
    el.modalTitle.textContent = 'Topik Baru';
    el.modalSubmitBtn.textContent = 'Buat Topik';
  }
  
  el.topicModal.classList.remove('hidden');
  el.modalTopicTitle.focus();
}

function closeTopicModal() {
  el.topicModal.classList.add('hidden');
  el.modalTopicId.value = '';
  el.modalTopicTitle.value = '';
}

// ----------------------------------------------------
// EVENT LISTENERS REGISTER
// ----------------------------------------------------
function registerEventListeners() {
  // Search topic sidebar
  el.searchTopics.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderTopicsList();
  });
  
  // Topic creation modal triggers
  el.newTopicBtn.addEventListener('click', () => openTopicModal());
  el.welcomeNewTopicBtn.addEventListener('click', () => openTopicModal());
  
  el.modalCloseBtn.addEventListener('click', closeTopicModal);
  el.modalCancelBtn.addEventListener('click', closeTopicModal);
  
  el.modalSubmitBtn.addEventListener('click', async () => {
    const title = el.modalTopicTitle.value.trim();
    const id = el.modalTopicId.value;
    
    if (!title) {
      alert('Nama topik tidak boleh kosong');
      return;
    }
    
    closeTopicModal();
    if (id) {
      await renameTopic(Number(id), title);
    } else {
      await createTopic(title);
    }
  });
  
  // Enter key press in modal
  el.modalTopicTitle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      el.modalSubmitBtn.click();
    }
  });

  // Edit active topic inline title
  el.editTopicTitleBtn.addEventListener('click', () => {
    el.activeTopicTitle.focus();
    // Select all text
    const range = document.createRange();
    range.selectNodeContents(el.activeTopicTitle);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  
  el.activeTopicTitle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // prevent adding newlines
      el.activeTopicTitle.blur();
    }
  });
  
  el.activeTopicTitle.addEventListener('blur', async () => {
    const newTitle = el.activeTopicTitle.textContent.trim();
    if (state.activeTopicId && newTitle) {
      const currentTopic = state.topics.find(t => t.id === state.activeTopicId);
      if (currentTopic && currentTopic.title !== newTitle) {
        await renameTopic(state.activeTopicId, newTitle);
      }
    }
  });

  // Workspace Actions
  el.addRootBranchBtn.addEventListener('click', () => {
    openBranchModal(null);
  });
  
  el.deleteTopicBtn.addEventListener('click', async () => {
    if (state.activeTopicId) {
      if (confirm('Apakah Anda yakin ingin menghapus topik ini beserta seluruh cabangnya?')) {
        await deleteTopic(state.activeTopicId);
      }
    }
  });

  // Details panel actions
  el.closePanelBtn.addEventListener('click', closeDetailsPanel);
  
  el.saveNodeBtn.addEventListener('click', saveActiveNodeChanges);
  
  el.deleteNodeBtn.addEventListener('click', async () => {
    const id = Number(el.editNodeId.value);
    const node = state.branches.find(b => b.id === id);
    if (id && node) {
      if (confirm(`Apakah Anda yakin ingin menghapus cabang "${node.title}" beserta sub-cabangnya?`)) {
        await deleteBranch(id);
      }
    }
  });

  // Hotkey support for saving (Ctrl + S)
  el.editNodeDescription.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveActiveNodeChanges();
    }
  });

  // Branch Modal Event Listeners
  el.branchModalInput.addEventListener('input', updateBranchPreview);
  el.branchModalCloseBtn.addEventListener('click', closeBranchModal);
  el.branchModalCancelBtn.addEventListener('click', closeBranchModal);
  el.branchModalSubmitBtn.addEventListener('click', submitBranchModal);
  el.branchModalInput.addEventListener('keydown', (e) => {
    // Submit on Ctrl+Enter, but allow normal newlines with Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      submitBranchModal();
    }
  });
}

// ----------------------------------------------------
// INITIAL RUN
// ----------------------------------------------------
async function init() {
  registerEventListeners();
  const ok = await checkDatabaseStatus();
  // Fetch topics if connected or start polling
  await fetchTopics();
  updateWorkspaceView();
  
  // Periodically verify database status
  setInterval(checkDatabaseStatus, 10000);
}

// Start Application
window.addEventListener('DOMContentLoaded', init);
