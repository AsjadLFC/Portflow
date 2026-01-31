const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const { exec } = require('child_process');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#0a0a0f',
    title: 'Portflow'
  });

  mainWindow.loadFile('renderer/index.html');
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Parse ss output into structured data
function parseSSOutput(output, protocol) {
  const lines = output.trim().split('\n');
  const ports = [];

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // ss -tlnp or -ulnp output format:
    // State  Recv-Q Send-Q  Local Address:Port  Peer Address:Port  Process
    const parts = line.split(/\s+/);
    if (parts.length < 5) continue;

    const state = parts[0];
    const localAddr = parts[4] || '';

    // Extract port from address (handle IPv6 brackets)
    let address = '*';
    let port = '';

    if (localAddr.includes(']:')) {
      // IPv6: [::1]:8080
      const match = localAddr.match(/\[([^\]]+)\]:(\d+)/);
      if (match) {
        address = match[1];
        port = match[2];
      }
    } else if (localAddr.includes(':')) {
      const lastColon = localAddr.lastIndexOf(':');
      address = localAddr.substring(0, lastColon) || '*';
      port = localAddr.substring(lastColon + 1);
    }

    // Extract process info from the line
    let pid = '';
    let processName = '';

    const processMatch = line.match(/users:\(\("([^"]+)",pid=(\d+)/);
    if (processMatch) {
      processName = processMatch[1];
      pid = processMatch[2];
    }

    if (port) {
      ports.push({
        protocol: protocol.toUpperCase(),
        port,
        address,
        state,
        pid,
        processName
      });
    }
  }

  return ports;
}

// Parse iptables NAT rules
function parseIPTablesOutput(output) {
  const lines = output.trim().split('\n');
  const rules = [];
  let currentChain = '';

  for (const line of lines) {
    if (line.startsWith('Chain')) {
      currentChain = line.split(' ')[1] || '';
      continue;
    }

    if (line.includes('DNAT') || line.includes('REDIRECT') || line.includes('MASQUERADE')) {
      const parts = line.split(/\s+/).filter(p => p);
      if (parts.length >= 4) {
        const dptMatch = line.match(/dpt:(\d+)/);
        const toMatch = line.match(/to:([^\s]+)/);

        rules.push({
          chain: currentChain,
          target: parts[0],
          protocol: parts[1],
          source: parts[3],
          destination: parts[4],
          dport: dptMatch ? dptMatch[1] : '',
          toDestination: toMatch ? toMatch[1] : '',
          raw: line.trim()
        });
      }
    }
  }

  return rules;
}

// Get listening TCP ports
ipcMain.handle('get-tcp-ports', async () => {
  return new Promise((resolve) => {
    exec('ss -tlnp 2>/dev/null', (error, stdout) => {
      if (error) {
        resolve({ success: false, error: error.message, ports: [] });
        return;
      }
      const ports = parseSSOutput(stdout, 'tcp');
      resolve({ success: true, ports });
    });
  });
});

// Get listening UDP ports
ipcMain.handle('get-udp-ports', async () => {
  return new Promise((resolve) => {
    exec('ss -ulnp 2>/dev/null', (error, stdout) => {
      if (error) {
        resolve({ success: false, error: error.message, ports: [] });
        return;
      }
      const ports = parseSSOutput(stdout, 'udp');
      resolve({ success: true, ports });
    });
  });
});

// Get port forwards (iptables NAT + SSH tunnels)
ipcMain.handle('get-port-forwards', async () => {
  return new Promise((resolve) => {
    // Try to get iptables NAT rules (may need sudo)
    exec('iptables -t nat -L -n 2>/dev/null || echo "PERMISSION_DENIED"', (error, stdout) => {
      let natRules = [];
      let needsElevation = false;

      if (stdout.includes('PERMISSION_DENIED') || error) {
        needsElevation = true;
      } else {
        natRules = parseIPTablesOutput(stdout);
      }

      // Also check for SSH tunnels by looking at ssh processes
      exec('ps aux | grep "ssh.*-[LR]" 2>/dev/null | grep -v grep', (err, sshOutput) => {
        const sshTunnels = [];
        if (!err && sshOutput.trim()) {
          const lines = sshOutput.trim().split('\n');
          for (const line of lines) {
            const localMatch = line.match(/-L\s*(\d+):([^:]+):(\d+)/);
            const remoteMatch = line.match(/-R\s*(\d+):([^:]+):(\d+)/);

            if (localMatch) {
              sshTunnels.push({
                type: 'SSH Local Forward',
                localPort: localMatch[1],
                remoteHost: localMatch[2],
                remotePort: localMatch[3],
                raw: line.trim()
              });
            }
            if (remoteMatch) {
              sshTunnels.push({
                type: 'SSH Remote Forward',
                localPort: remoteMatch[1],
                remoteHost: remoteMatch[2],
                remotePort: remoteMatch[3],
                raw: line.trim()
              });
            }
          }
        }

        resolve({
          success: true,
          natRules,
          sshTunnels,
          needsElevation
        });
      });
    });
  });
});

// Kill process by PID
ipcMain.handle('kill-process', async (event, pid) => {
  // Validate PID is a number
  if (!/^\d+$/.test(pid)) {
    return { success: false, error: 'Invalid PID format' };
  }

  return new Promise((resolve) => {
    // First try without elevation
    exec(`kill ${pid} 2>&1`, (error, stdout, stderr) => {
      if (!error) {
        resolve({ success: true, message: `Process ${pid} terminated` });
        return;
      }

      // Check if it's a permission error
      const output = stderr || stdout || '';
      if (output.includes('Operation not permitted') || output.includes('Permission denied')) {
        resolve({
          success: false,
          needsElevation: true,
          error: 'Permission denied. Elevated privileges required.'
        });
      } else if (output.includes('No such process')) {
        resolve({ success: false, error: 'Process no longer exists' });
      } else {
        resolve({ success: false, error: output || error.message });
      }
    });
  });
});

// Kill process with elevated privileges using pkexec
ipcMain.handle('kill-process-elevated', async (event, pid) => {
  // Validate PID is a number
  if (!/^\d+$/.test(pid)) {
    return { success: false, error: 'Invalid PID format' };
  }

  return new Promise((resolve) => {
    exec(`pkexec kill ${pid} 2>&1`, (error, stdout, stderr) => {
      if (!error) {
        resolve({ success: true, message: `Process ${pid} terminated with elevated privileges` });
        return;
      }

      const output = stderr || stdout || '';
      if (output.includes('dismissed') || output.includes('cancelled')) {
        resolve({ success: false, error: 'Authentication cancelled by user' });
      } else if (output.includes('No such process')) {
        resolve({ success: false, error: 'Process no longer exists' });
      } else {
        resolve({ success: false, error: output || error.message });
      }
    });
  });
});

// Get iptables with elevation
ipcMain.handle('get-port-forwards-elevated', async () => {
  return new Promise((resolve) => {
    exec('pkexec iptables -t nat -L -n 2>&1', (error, stdout, stderr) => {
      if (error) {
        const output = stderr || stdout || '';
        if (output.includes('dismissed') || output.includes('cancelled')) {
          resolve({ success: false, error: 'Authentication cancelled' });
        } else {
          resolve({ success: false, error: output || error.message });
        }
        return;
      }

      const natRules = parseIPTablesOutput(stdout);
      resolve({ success: true, natRules });
    });
  });
});

// ==========================================
// Container Runtime Support (Docker, Podman, Kubernetes)
// ==========================================

// Parse docker/podman ps output (they use the same format)
function parseDockerPodmanOutput(output) {
  const lines = output.trim().split('\n');
  const containers = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split('\t');
    if (parts.length >= 7) {
      containers.push({
        id: parts[0],
        image: parts[1],
        command: parts[2],
        created: parts[3],
        status: parts[4],
        ports: parts[5],
        name: parts[6]
      });
    }
  }

  return containers;
}

// Parse kubectl get pods output
function parseKubectlOutput(output) {
  const lines = output.trim().split('\n');
  const pods = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Format: NAMESPACE\tNAME\tREADY\tSTATUS\tRESTARTS\tAGE\tIP\tNODE
    const parts = line.split('\t');
    if (parts.length >= 6) {
      pods.push({
        id: parts[1], // Pod name as ID
        image: parts[0], // Namespace
        command: '', // Not available from kubectl get pods
        created: parts[5], // AGE
        status: parts[3], // STATUS
        ports: parts[6] || '', // IP
        name: parts[1], // Pod name
        namespace: parts[0],
        ready: parts[2],
        restarts: parts[4],
        node: parts[7] || ''
      });
    }
  }

  return pods;
}

// Check which container runtime is available
function checkRuntime(command) {
  return new Promise((resolve) => {
    exec(`which ${command} 2>/dev/null`, (error) => {
      resolve(!error);
    });
  });
}

// Check if runtime daemon is running
function checkRuntimeDaemon(runtime) {
  return new Promise((resolve) => {
    let checkCmd;
    switch (runtime) {
      case 'docker':
        checkCmd = 'docker info 2>&1';
        break;
      case 'podman':
        checkCmd = 'podman info 2>&1';
        break;
      case 'kubectl':
        checkCmd = 'kubectl cluster-info 2>&1';
        break;
      default:
        resolve({ running: false, error: 'Unknown runtime' });
        return;
    }

    exec(checkCmd, (error, stdout, stderr) => {
      const output = stderr || stdout || '';
      if (error) {
        if (output.includes('permission denied') || output.includes('connect: permission denied')) {
          resolve({ running: false, error: 'Permission denied', needsPermission: true });
        } else if (output.includes('Cannot connect') || output.includes('Is the docker daemon running') || output.includes('not running')) {
          resolve({ running: false, error: `${runtime} daemon is not running` });
        } else if (output.includes('Unable to connect') || output.includes('connection refused')) {
          resolve({ running: false, error: `Cannot connect to ${runtime}` });
        } else {
          resolve({ running: false, error: output.substring(0, 100) });
        }
      } else {
        resolve({ running: true });
      }
    });
  });
}

// Get containers from Docker or Podman
function getDockerPodmanContainers(runtime) {
  return new Promise((resolve) => {
    const format = '{{.ID}}\t{{.Image}}\t{{.Command}}\t{{.CreatedAt}}\t{{.Status}}\t{{.Ports}}\t{{.Names}}';
    exec(`${runtime} ps -a --format "${format}" 2>&1`, (error, stdout, stderr) => {
      if (error) {
        const output = stderr || stdout || '';
        resolve({ success: false, error: output || error.message, containers: [] });
        return;
      }

      const containers = parseDockerPodmanOutput(stdout);
      resolve({ success: true, containers });
    });
  });
}

// Get pods from Kubernetes
function getKubernetesPods() {
  return new Promise((resolve) => {
    // Get pods from all namespaces with custom columns
    const cmd = 'kubectl get pods --all-namespaces -o custom-columns="NAMESPACE:.metadata.namespace,NAME:.metadata.name,READY:.status.containerStatuses[0].ready,STATUS:.status.phase,RESTARTS:.status.containerStatuses[0].restartCount,AGE:.metadata.creationTimestamp,IP:.status.podIP,NODE:.spec.nodeName" --no-headers 2>&1';

    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        const output = stderr || stdout || '';
        resolve({ success: false, error: output || error.message, containers: [] });
        return;
      }

      // Parse the output
      const lines = stdout.trim().split('\n');
      const pods = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 6) {
          pods.push({
            id: `${parts[0]}/${parts[1]}`, // namespace/name as ID
            image: parts[0], // Namespace shown as "image" in UI
            command: '',
            created: parts[5],
            status: parts[3],
            ports: parts[6] || '-',
            name: parts[1],
            namespace: parts[0],
            ready: parts[2],
            restarts: parts[4],
            node: parts[7] || ''
          });
        }
      }

      resolve({ success: true, containers: pods });
    });
  });
}

// Get all containers from all available runtimes
ipcMain.handle('get-containers', async () => {
  const result = {
    success: false,
    containers: [],
    runtimes: {
      docker: { available: false, running: false, error: null },
      podman: { available: false, running: false, error: null },
      kubernetes: { available: false, running: false, error: null }
    },
    activeRuntime: null
  };

  // Check which runtimes are available
  const [hasDocker, hasPodman, hasKubectl] = await Promise.all([
    checkRuntime('docker'),
    checkRuntime('podman'),
    checkRuntime('kubectl')
  ]);

  result.runtimes.docker.available = hasDocker;
  result.runtimes.podman.available = hasPodman;
  result.runtimes.kubernetes.available = hasKubectl;

  // If no runtime is available
  if (!hasDocker && !hasPodman && !hasKubectl) {
    result.error = 'No container runtime found (Docker, Podman, or kubectl)';
    return result;
  }

  // Check daemon status and fetch containers for available runtimes
  const allContainers = [];

  // Docker
  if (hasDocker) {
    const daemonStatus = await checkRuntimeDaemon('docker');
    result.runtimes.docker.running = daemonStatus.running;
    result.runtimes.docker.error = daemonStatus.error;
    result.runtimes.docker.needsPermission = daemonStatus.needsPermission;

    if (daemonStatus.running) {
      const dockerResult = await getDockerPodmanContainers('docker');
      if (dockerResult.success) {
        dockerResult.containers.forEach(c => {
          c.runtime = 'docker';
          allContainers.push(c);
        });
        result.activeRuntime = result.activeRuntime || 'docker';
      }
    }
  }

  // Podman
  if (hasPodman) {
    const daemonStatus = await checkRuntimeDaemon('podman');
    result.runtimes.podman.running = daemonStatus.running;
    result.runtimes.podman.error = daemonStatus.error;

    if (daemonStatus.running) {
      const podmanResult = await getDockerPodmanContainers('podman');
      if (podmanResult.success) {
        podmanResult.containers.forEach(c => {
          c.runtime = 'podman';
          allContainers.push(c);
        });
        result.activeRuntime = result.activeRuntime || 'podman';
      }
    }
  }

  // Kubernetes
  if (hasKubectl) {
    const daemonStatus = await checkRuntimeDaemon('kubectl');
    result.runtimes.kubernetes.running = daemonStatus.running;
    result.runtimes.kubernetes.error = daemonStatus.error;

    if (daemonStatus.running) {
      const k8sResult = await getKubernetesPods();
      if (k8sResult.success) {
        k8sResult.containers.forEach(c => {
          c.runtime = 'kubernetes';
          allContainers.push(c);
        });
        result.activeRuntime = result.activeRuntime || 'kubernetes';
      }
    }
  }

  result.containers = allContainers;
  result.success = allContainers.length > 0 || result.activeRuntime !== null;

  return result;
});

// Validate container/pod ID format
function validateContainerId(id, runtime) {
  if (runtime === 'kubernetes') {
    // Kubernetes: namespace/podname format
    return /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(id) || /^[a-zA-Z0-9_-]+$/.test(id);
  }
  // Docker/Podman: alphanumeric with underscores and hyphens
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

// Stop container/pod
ipcMain.handle('container-stop', async (event, containerId, runtime) => {
  if (!validateContainerId(containerId, runtime)) {
    return { success: false, error: 'Invalid container ID format' };
  }

  return new Promise((resolve) => {
    let cmd;
    switch (runtime) {
      case 'docker':
        cmd = `docker stop ${containerId}`;
        break;
      case 'podman':
        cmd = `podman stop ${containerId}`;
        break;
      case 'kubernetes':
        // For K8s, we delete the pod (it will be recreated by the controller if managed)
        const [namespace, podName] = containerId.includes('/') ? containerId.split('/') : ['default', containerId];
        cmd = `kubectl delete pod ${podName} -n ${namespace}`;
        break;
      default:
        resolve({ success: false, error: 'Unknown runtime' });
        return;
    }

    exec(`${cmd} 2>&1`, (error, stdout, stderr) => {
      if (!error) {
        resolve({ success: true, message: `Container ${containerId} stopped` });
      } else {
        resolve({ success: false, error: (stderr || stdout || error.message).substring(0, 200) });
      }
    });
  });
});

// Start container (not applicable to K8s pods directly)
ipcMain.handle('container-start', async (event, containerId, runtime) => {
  if (!validateContainerId(containerId, runtime)) {
    return { success: false, error: 'Invalid container ID format' };
  }

  if (runtime === 'kubernetes') {
    return { success: false, error: 'Cannot start Kubernetes pods directly. Use deployments or restart the workload.' };
  }

  return new Promise((resolve) => {
    const cmd = runtime === 'docker' ? `docker start ${containerId}` : `podman start ${containerId}`;

    exec(`${cmd} 2>&1`, (error, stdout, stderr) => {
      if (!error) {
        resolve({ success: true, message: `Container ${containerId} started` });
      } else {
        resolve({ success: false, error: (stderr || stdout || error.message).substring(0, 200) });
      }
    });
  });
});

// Remove container/pod
ipcMain.handle('container-remove', async (event, containerId, runtime) => {
  if (!validateContainerId(containerId, runtime)) {
    return { success: false, error: 'Invalid container ID format' };
  }

  return new Promise((resolve) => {
    let cmd;
    switch (runtime) {
      case 'docker':
        cmd = `docker rm -f ${containerId}`;
        break;
      case 'podman':
        cmd = `podman rm -f ${containerId}`;
        break;
      case 'kubernetes':
        const [namespace, podName] = containerId.includes('/') ? containerId.split('/') : ['default', containerId];
        cmd = `kubectl delete pod ${podName} -n ${namespace} --grace-period=0 --force`;
        break;
      default:
        resolve({ success: false, error: 'Unknown runtime' });
        return;
    }

    exec(`${cmd} 2>&1`, (error, stdout, stderr) => {
      if (!error) {
        resolve({ success: true, message: `Container ${containerId} removed` });
      } else {
        resolve({ success: false, error: (stderr || stdout || error.message).substring(0, 200) });
      }
    });
  });
});

