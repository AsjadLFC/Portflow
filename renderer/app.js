// ==========================================
// PORTFLOW - Application Logic
// ==========================================

// State
let tcpPorts = [];
let udpPorts = [];
let natRules = [];
let sshTunnels = [];
let containers = [];
let runtimeStatus = {
  docker: { available: false, running: false, error: null },
  podman: { available: false, running: false, error: null },
  kubernetes: { available: false, running: false, error: null }
};
let autoRefreshInterval = null;
let currentKillTarget = null;
let currentContainerAction = null;

// DOM Elements
const elements = {
  // Tabs
  tabs: document.querySelectorAll('.tab'),
  panels: document.querySelectorAll('.panel'),

  // Counts
  tcpCount: document.getElementById('tcp-count'),
  udpCount: document.getElementById('udp-count'),
  forwardsCount: document.getElementById('forwards-count'),
  containersCount: document.getElementById('containers-count'),
  totalPorts: document.getElementById('total-ports'),
  lastScan: document.getElementById('last-scan'),

  // Table Bodies
  tcpTableBody: document.getElementById('tcp-table-body'),
  udpTableBody: document.getElementById('udp-table-body'),
  natTableBody: document.getElementById('nat-table-body'),
  sshTableBody: document.getElementById('ssh-table-body'),
  containersTableBody: document.getElementById('containers-table-body'),

  // Runtime display
  runtimeStatus: document.getElementById('runtime-status'),
  runtimeBadges: document.getElementById('runtime-badges'),

  // Buttons
  refreshBtn: document.getElementById('refresh-btn'),
  elevateIptablesBtn: document.getElementById('elevate-iptables-btn'),

  // Kill Modal
  killModal: document.getElementById('kill-modal'),
  modalPid: document.getElementById('modal-pid'),
  modalProcess: document.getElementById('modal-process'),
  modalPort: document.getElementById('modal-port'),
  modalCancel: document.getElementById('modal-cancel'),
  modalConfirm: document.getElementById('modal-confirm'),

  // Container Modal
  containerModal: document.getElementById('container-modal'),
  containerModalTitle: document.getElementById('container-modal-title'),
  containerModalText: document.getElementById('container-modal-text'),
  containerModalRuntime: document.getElementById('container-modal-runtime'),
  containerModalName: document.getElementById('container-modal-name'),
  containerModalImage: document.getElementById('container-modal-image'),
  containerModalId: document.getElementById('container-modal-id'),
  containerModalWarning: document.getElementById('container-modal-warning'),
  containerModalCancel: document.getElementById('container-modal-cancel'),
  containerModalConfirm: document.getElementById('container-modal-confirm'),

  // Toast
  toast: document.getElementById('toast'),
  toastMessage: document.querySelector('.toast-message')
};

// ==========================================
// Tab Navigation
// ==========================================
function initTabs() {
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;

      // Update active tab
      elements.tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update active panel
      elements.panels.forEach(p => p.classList.remove('active'));
      document.getElementById(`panel-${targetTab}`).classList.add('active');
    });
  });
}

// ==========================================
// Toast Notifications
// ==========================================
function showToast(message, type = 'info') {
  elements.toast.className = 'toast';
  elements.toast.classList.add(type, 'active');
  elements.toastMessage.textContent = message;

  setTimeout(() => {
    elements.toast.classList.remove('active');
  }, 3000);
}

// ==========================================
// Kill Modal
// ==========================================
function showKillModal(port, pid, processName) {
  currentKillTarget = { port, pid, processName };

  elements.modalPid.textContent = pid;
  elements.modalProcess.textContent = processName || 'Unknown';
  elements.modalPort.textContent = port;

  elements.killModal.classList.add('active');
}

function hideKillModal() {
  elements.killModal.classList.remove('active');
  currentKillTarget = null;
}

function initKillModal() {
  elements.modalCancel.addEventListener('click', hideKillModal);

  elements.modalConfirm.addEventListener('click', async () => {
    if (!currentKillTarget) return;

    const { pid, processName } = currentKillTarget;
    hideKillModal();

    await killProcess(pid, processName);
  });

  // Close modal on overlay click
  elements.killModal.addEventListener('click', (e) => {
    if (e.target === elements.killModal) {
      hideKillModal();
    }
  });
}

// ==========================================
// Container Modal
// ==========================================
function showContainerModal(action, container) {
  currentContainerAction = { action, container };

  const titles = {
    stop: 'STOP CONTAINER',
    start: 'START CONTAINER',
    remove: 'REMOVE CONTAINER'
  };

  const texts = {
    stop: container.runtime === 'kubernetes'
      ? 'You are about to delete this pod (it may be recreated by its controller):'
      : 'You are about to stop this container:',
    start: 'You are about to start this container:',
    remove: container.runtime === 'kubernetes'
      ? 'You are about to force delete this pod:'
      : 'You are about to remove this container:'
  };

  const warnings = {
    stop: container.runtime === 'kubernetes'
      ? 'The pod will be deleted. If managed by a controller, it will be recreated.'
      : 'The container will be stopped.',
    start: 'The container will be started.',
    remove: 'This action cannot be undone.'
  };

  const buttonClasses = {
    stop: 'btn btn-warning',
    start: 'btn btn-primary',
    remove: 'btn btn-danger'
  };

  elements.containerModalTitle.textContent = titles[action];
  elements.containerModalText.textContent = texts[action];
  elements.containerModalWarning.textContent = warnings[action];
  elements.containerModalRuntime.textContent = container.runtime.toUpperCase();
  elements.containerModalName.textContent = container.name;
  elements.containerModalImage.textContent = container.image || container.namespace || '-';
  elements.containerModalId.textContent = container.id.length > 12 ? container.id.substring(0, 12) + '...' : container.id;
  elements.containerModalConfirm.className = buttonClasses[action];
  elements.containerModalConfirm.textContent = action.toUpperCase();

  elements.containerModal.classList.add('active');
}

function hideContainerModal() {
  elements.containerModal.classList.remove('active');
  currentContainerAction = null;
}

function initContainerModal() {
  elements.containerModalCancel.addEventListener('click', hideContainerModal);

  elements.containerModalConfirm.addEventListener('click', async () => {
    if (!currentContainerAction) return;

    const { action, container } = currentContainerAction;
    hideContainerModal();

    await performContainerAction(action, container);
  });

  // Close modal on overlay click
  elements.containerModal.addEventListener('click', (e) => {
    if (e.target === elements.containerModal) {
      hideContainerModal();
    }
  });
}

// ==========================================
// Process Killing
// ==========================================
async function killProcess(pid, processName) {
  showToast(`Terminating process ${pid}...`, 'info');

  try {
    // First try without elevation
    let result = await window.portflow.killProcess(pid);

    if (!result.success && result.needsElevation) {
      showToast('Requesting elevated privileges...', 'info');
      result = await window.portflow.killProcessElevated(pid);
    }

    if (result.success) {
      showToast(`Process ${pid} (${processName || 'unknown'}) terminated`, 'success');
      // Refresh data after kill
      await refreshData();
    } else {
      showToast(`Failed: ${result.error}`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

// ==========================================
// Container Actions
// ==========================================
async function performContainerAction(action, container) {
  const actionVerbs = {
    stop: 'Stopping',
    start: 'Starting',
    remove: 'Removing'
  };

  const displayName = container.runtime === 'kubernetes' ? 'pod' : 'container';
  showToast(`${actionVerbs[action]} ${displayName} ${container.name}...`, 'info');

  try {
    let result;
    switch (action) {
      case 'stop':
        result = await window.portflow.containerStop(container.id, container.runtime);
        break;
      case 'start':
        result = await window.portflow.containerStart(container.id, container.runtime);
        break;
      case 'remove':
        result = await window.portflow.containerRemove(container.id, container.runtime);
        break;
      default:
        return;
    }

    if (result.success) {
      showToast(`${displayName} ${container.name} ${action === 'stop' ? 'stopped' : action === 'start' ? 'started' : 'removed'} successfully`, 'success');
      await refreshData();
    } else {
      showToast(`Failed: ${result.error}`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

// ==========================================
// Table Rendering
// ==========================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderPortRow(port) {
  const stateClass = port.state === 'UNCONN' ? 'unconn' : '';
  const hasPid = port.pid && port.pid !== '';

  return `
    <tr>
      <td class="cell-port">${escapeHtml(port.port)}</td>
      <td class="cell-address">${escapeHtml(port.address)}</td>
      <td><span class="cell-state ${stateClass}">${escapeHtml(port.state)}</span></td>
      <td class="${hasPid ? 'cell-pid' : 'cell-na'}">${hasPid ? escapeHtml(port.pid) : 'N/A'}</td>
      <td class="${port.processName ? 'cell-process' : 'cell-na'}" title="${escapeHtml(port.processName || '')}">${port.processName ? escapeHtml(port.processName) : 'N/A'}</td>
      <td>
        <button
          class="btn-kill"
          ${!hasPid ? 'disabled title="No PID available"' : ''}
          data-port="${escapeHtml(port.port)}"
          data-pid="${escapeHtml(port.pid)}"
          data-process="${escapeHtml(port.processName || '')}"
        >
          KILL
        </button>
      </td>
    </tr>
  `;
}

function renderEmptyRow(message, colspan = 6) {
  return `
    <tr class="empty-row">
      <td colspan="${colspan}">
        <div class="empty-icon">&#x2205;</div>
        <div>${message}</div>
      </td>
    </tr>
  `;
}

function renderPortsTable(ports, tableBody) {
  if (ports.length === 0) {
    tableBody.innerHTML = renderEmptyRow('No ports found');
    return;
  }

  tableBody.innerHTML = ports.map(renderPortRow).join('');

  // Attach kill button listeners
  tableBody.querySelectorAll('.btn-kill').forEach(btn => {
    btn.addEventListener('click', () => {
      const port = btn.dataset.port;
      const pid = btn.dataset.pid;
      const process = btn.dataset.process;

      if (pid) {
        showKillModal(port, pid, process);
      }
    });
  });
}

function renderNatTable(rules) {
  if (rules.length === 0) {
    elements.natTableBody.innerHTML = renderEmptyRow('No NAT rules found', 6);
    return;
  }

  elements.natTableBody.innerHTML = rules.map(rule => `
    <tr>
      <td>${escapeHtml(rule.chain)}</td>
      <td><span class="cell-state">${escapeHtml(rule.target)}</span></td>
      <td>${escapeHtml(rule.protocol)}</td>
      <td class="cell-address">${escapeHtml(rule.source)}</td>
      <td class="cell-port">${escapeHtml(rule.dport || 'any')}</td>
      <td class="cell-address">${escapeHtml(rule.toDestination || '-')}</td>
    </tr>
  `).join('');
}

function renderSshTable(tunnels) {
  if (tunnels.length === 0) {
    elements.sshTableBody.innerHTML = renderEmptyRow('No SSH tunnels found', 4);
    return;
  }

  elements.sshTableBody.innerHTML = tunnels.map(tunnel => `
    <tr>
      <td><span class="cell-state">${escapeHtml(tunnel.type)}</span></td>
      <td class="cell-port">${escapeHtml(tunnel.localPort)}</td>
      <td class="cell-address">${escapeHtml(tunnel.remoteHost)}</td>
      <td class="cell-port">${escapeHtml(tunnel.remotePort)}</td>
    </tr>
  `).join('');
}

// ==========================================
// Container Table Rendering
// ==========================================
function getStatusClass(status) {
  const statusLower = status.toLowerCase();
  if (statusLower.includes('up') || statusLower.includes('running')) return 'running';
  if (statusLower.includes('exited') || statusLower.includes('dead') || statusLower.includes('failed')) return 'exited';
  if (statusLower.includes('paused')) return 'paused';
  if (statusLower.includes('created') || statusLower.includes('pending')) return 'created';
  return '';
}

function getStatusLabel(status) {
  const statusLower = status.toLowerCase();
  if (statusLower.includes('up')) return 'RUNNING';
  if (statusLower.includes('running')) return 'RUNNING';
  if (statusLower.includes('exited')) return 'EXITED';
  if (statusLower.includes('paused')) return 'PAUSED';
  if (statusLower.includes('created')) return 'CREATED';
  if (statusLower.includes('dead')) return 'DEAD';
  if (statusLower.includes('pending')) return 'PENDING';
  if (statusLower.includes('failed')) return 'FAILED';
  if (statusLower.includes('succeeded')) return 'COMPLETED';
  return status.toUpperCase().substring(0, 10);
}

function isContainerRunning(status) {
  const statusLower = status.toLowerCase();
  return statusLower.includes('up') || statusLower.includes('running');
}

function renderContainerRow(container) {
  const statusClass = getStatusClass(container.status);
  const statusLabel = getStatusLabel(container.status);
  const running = isContainerRunning(container.status);
  const isK8s = container.runtime === 'kubernetes';

  // For K8s, show namespace as image column
  const imageDisplay = isK8s ? (container.namespace || '-') : container.image;
  // For K8s, show IP as ports column
  const portsDisplay = container.ports || '-';

  return `
    <tr>
      <td><span class="cell-runtime ${container.runtime}">${container.runtime.toUpperCase()}</span></td>
      <td class="cell-container-name" title="${escapeHtml(container.id)}">${escapeHtml(container.name)}</td>
      <td class="cell-image" title="${escapeHtml(imageDisplay)}">${escapeHtml(imageDisplay)}</td>
      <td><span class="cell-status ${statusClass}">${statusLabel}</span></td>
      <td class="cell-ports" title="${escapeHtml(portsDisplay)}">${escapeHtml(portsDisplay)}</td>
      <td>
        <div class="docker-actions">
          ${running ? `
            <button class="btn-docker stop" data-action="stop" data-id="${escapeHtml(container.id)}" data-name="${escapeHtml(container.name)}" data-image="${escapeHtml(container.image || '')}" data-runtime="${container.runtime}" data-namespace="${escapeHtml(container.namespace || '')}">${isK8s ? 'DEL' : 'STOP'}</button>
          ` : `
            ${!isK8s ? `<button class="btn-docker start" data-action="start" data-id="${escapeHtml(container.id)}" data-name="${escapeHtml(container.name)}" data-image="${escapeHtml(container.image || '')}" data-runtime="${container.runtime}">START</button>` : ''}
          `}
          <button class="btn-docker remove" data-action="remove" data-id="${escapeHtml(container.id)}" data-name="${escapeHtml(container.name)}" data-image="${escapeHtml(container.image || '')}" data-runtime="${container.runtime}" data-namespace="${escapeHtml(container.namespace || '')}">RM</button>
        </div>
      </td>
    </tr>
  `;
}

function renderRuntimeBadges() {
  const badges = [];

  // Docker
  if (runtimeStatus.docker.available) {
    const statusClass = runtimeStatus.docker.running ? 'active' : 'error';
    const dockerCount = containers.filter(c => c.runtime === 'docker').length;
    badges.push(`
      <div class="runtime-badge ${statusClass}" title="${runtimeStatus.docker.error || 'Connected'}">
        <span class="badge-icon">&#x25A3;</span>
        DOCKER
        ${runtimeStatus.docker.running ? `<span class="badge-count">${dockerCount}</span>` : ''}
      </div>
    `);
  } else {
    badges.push(`
      <div class="runtime-badge unavailable" title="Docker not installed">
        <span class="badge-icon">&#x25A3;</span>
        DOCKER
      </div>
    `);
  }

  // Podman
  if (runtimeStatus.podman.available) {
    const statusClass = runtimeStatus.podman.running ? 'active' : 'error';
    const podmanCount = containers.filter(c => c.runtime === 'podman').length;
    badges.push(`
      <div class="runtime-badge ${statusClass}" title="${runtimeStatus.podman.error || 'Connected'}">
        <span class="badge-icon">&#x25A2;</span>
        PODMAN
        ${runtimeStatus.podman.running ? `<span class="badge-count">${podmanCount}</span>` : ''}
      </div>
    `);
  } else {
    badges.push(`
      <div class="runtime-badge unavailable" title="Podman not installed">
        <span class="badge-icon">&#x25A2;</span>
        PODMAN
      </div>
    `);
  }

  // Kubernetes
  if (runtimeStatus.kubernetes.available) {
    const statusClass = runtimeStatus.kubernetes.running ? 'active' : 'error';
    const k8sCount = containers.filter(c => c.runtime === 'kubernetes').length;
    badges.push(`
      <div class="runtime-badge ${statusClass}" title="${runtimeStatus.kubernetes.error || 'Connected'}">
        <span class="badge-icon">&#x2388;</span>
        K8S
        ${runtimeStatus.kubernetes.running ? `<span class="badge-count">${k8sCount}</span>` : ''}
      </div>
    `);
  } else {
    badges.push(`
      <div class="runtime-badge unavailable" title="kubectl not installed">
        <span class="badge-icon">&#x2388;</span>
        K8S
      </div>
    `);
  }

  elements.runtimeBadges.innerHTML = badges.join('');
}

function renderContainersTable() {
  // Update runtime subtitle
  const activeRuntimes = [];
  if (runtimeStatus.docker.running) activeRuntimes.push('Docker');
  if (runtimeStatus.podman.running) activeRuntimes.push('Podman');
  if (runtimeStatus.kubernetes.running) activeRuntimes.push('Kubernetes');

  if (activeRuntimes.length > 0) {
    elements.runtimeStatus.textContent = `// ${activeRuntimes.join(' + ')}`;
  } else {
    elements.runtimeStatus.textContent = '// No container runtime available';
  }

  // Render runtime badges
  renderRuntimeBadges();

  // Check if any runtime is available
  const anyAvailable = runtimeStatus.docker.available || runtimeStatus.podman.available || runtimeStatus.kubernetes.available;
  const anyRunning = runtimeStatus.docker.running || runtimeStatus.podman.running || runtimeStatus.kubernetes.running;

  if (!anyAvailable) {
    elements.containersTableBody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="containers-unavailable">
            <div class="icon">&#x2717;</div>
            <div class="message">No container runtime found</div>
            <div class="hint">Install Docker, Podman, or kubectl to manage containers</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  if (!anyRunning) {
    const errors = [];
    if (runtimeStatus.docker.available && !runtimeStatus.docker.running) {
      errors.push(`Docker: ${runtimeStatus.docker.error || 'Not running'}`);
    }
    if (runtimeStatus.podman.available && !runtimeStatus.podman.running) {
      errors.push(`Podman: ${runtimeStatus.podman.error || 'Not running'}`);
    }
    if (runtimeStatus.kubernetes.available && !runtimeStatus.kubernetes.running) {
      errors.push(`K8s: ${runtimeStatus.kubernetes.error || 'Not connected'}`);
    }

    elements.containersTableBody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="containers-unavailable">
            <div class="icon">&#x26A0;</div>
            <div class="message">Cannot connect to container runtimes</div>
            <div class="hint">${errors.join('<br>')}</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  if (containers.length === 0) {
    elements.containersTableBody.innerHTML = renderEmptyRow('No containers found', 6);
    return;
  }

  elements.containersTableBody.innerHTML = containers.map(renderContainerRow).join('');

  // Attach action button listeners
  elements.containersTableBody.querySelectorAll('.btn-docker').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const container = {
        id: btn.dataset.id,
        name: btn.dataset.name,
        image: btn.dataset.image,
        runtime: btn.dataset.runtime,
        namespace: btn.dataset.namespace
      };
      showContainerModal(action, container);
    });
  });
}

// ==========================================
// Data Fetching
// ==========================================
async function fetchTcpPorts() {
  const result = await window.portflow.getTcpPorts();
  if (result.success) {
    tcpPorts = result.ports;
  }
  return result;
}

async function fetchUdpPorts() {
  const result = await window.portflow.getUdpPorts();
  if (result.success) {
    udpPorts = result.ports;
  }
  return result;
}

async function fetchPortForwards() {
  const result = await window.portflow.getPortForwards();
  if (result.success) {
    natRules = result.natRules || [];
    sshTunnels = result.sshTunnels || [];

    // Show elevation button if needed
    if (result.needsElevation) {
      elements.elevateIptablesBtn.style.display = 'inline-block';
    } else {
      elements.elevateIptablesBtn.style.display = 'none';
    }
  }
  return result;
}

async function fetchContainers() {
  const result = await window.portflow.getContainers();

  if (result.runtimes) {
    runtimeStatus = result.runtimes;
  }

  if (result.success) {
    containers = result.containers || [];
  } else {
    containers = [];
  }

  renderContainersTable();
  return result;
}

async function refreshData() {
  // Fetch all data in parallel
  await Promise.all([
    fetchTcpPorts(),
    fetchUdpPorts(),
    fetchPortForwards(),
    fetchContainers()
  ]);

  // Update UI
  renderPortsTable(tcpPorts, elements.tcpTableBody);
  renderPortsTable(udpPorts, elements.udpTableBody);
  renderNatTable(natRules);
  renderSshTable(sshTunnels);

  // Update counts
  elements.tcpCount.textContent = tcpPorts.length;
  elements.udpCount.textContent = udpPorts.length;
  elements.forwardsCount.textContent = natRules.length + sshTunnels.length;
  elements.containersCount.textContent = containers.length;
  elements.totalPorts.textContent = tcpPorts.length + udpPorts.length;

  // Update last scan time
  const now = new Date();
  elements.lastScan.textContent = now.toLocaleTimeString('en-US', { hour12: false });
}

// ==========================================
// Elevated iptables fetch
// ==========================================
async function fetchElevatedIptables() {
  showToast('Requesting elevated privileges for iptables...', 'info');

  try {
    const result = await window.portflow.getPortForwardsElevated();

    if (result.success) {
      natRules = result.natRules || [];
      renderNatTable(natRules);
      elements.forwardsCount.textContent = natRules.length + sshTunnels.length;
      elements.elevateIptablesBtn.style.display = 'none';
      showToast('NAT rules loaded successfully', 'success');
    } else {
      showToast(`Failed: ${result.error}`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

// ==========================================
// Auto-refresh
// ==========================================
function startAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }

  autoRefreshInterval = setInterval(refreshData, 3000);
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

// ==========================================
// Initialization
// ==========================================
async function init() {
  // Initialize tabs
  initTabs();

  // Initialize modals
  initKillModal();
  initContainerModal();

  // Refresh button
  elements.refreshBtn.addEventListener('click', async () => {
    elements.refreshBtn.disabled = true;
    await refreshData();
    elements.refreshBtn.disabled = false;
    showToast('Data refreshed', 'success');
  });

  // Elevate iptables button
  elements.elevateIptablesBtn.addEventListener('click', fetchElevatedIptables);

  // Close modals on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (elements.killModal.classList.contains('active')) {
        hideKillModal();
      }
      if (elements.containerModal.classList.contains('active')) {
        hideContainerModal();
      }
    }
  });

  // Initial data load
  await refreshData();

  // Start auto-refresh
  startAutoRefresh();

  // Pause auto-refresh when window is hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAutoRefresh();
    } else {
      refreshData();
      startAutoRefresh();
    }
  });
}

// Start the app
init();
