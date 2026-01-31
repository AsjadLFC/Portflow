const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('portflow', {
  // Get listening TCP ports
  getTcpPorts: () => ipcRenderer.invoke('get-tcp-ports'),

  // Get listening UDP ports
  getUdpPorts: () => ipcRenderer.invoke('get-udp-ports'),

  // Get port forwards (iptables NAT rules + SSH tunnels)
  getPortForwards: () => ipcRenderer.invoke('get-port-forwards'),

  // Get port forwards with elevated privileges
  getPortForwardsElevated: () => ipcRenderer.invoke('get-port-forwards-elevated'),

  // Kill a process by PID (tries without elevation first)
  killProcess: (pid) => ipcRenderer.invoke('kill-process', pid),

  // Kill a process with elevated privileges
  killProcessElevated: (pid) => ipcRenderer.invoke('kill-process-elevated', pid),

  // Get all containers (Docker, Podman, Kubernetes)
  getContainers: () => ipcRenderer.invoke('get-containers'),

  // Stop a container (works with Docker, Podman, K8s)
  containerStop: (containerId, runtime) => ipcRenderer.invoke('container-stop', containerId, runtime),

  // Start a container (Docker/Podman only)
  containerStart: (containerId, runtime) => ipcRenderer.invoke('container-start', containerId, runtime),

  // Remove a container (works with Docker, Podman, K8s)
  containerRemove: (containerId, runtime) => ipcRenderer.invoke('container-remove', containerId, runtime),

  // Legacy Docker-specific APIs (for backwards compatibility)
  getDockerContainers: () => ipcRenderer.invoke('get-containers'),
  dockerStop: (containerId) => ipcRenderer.invoke('container-stop', containerId, 'docker'),
  dockerStart: (containerId) => ipcRenderer.invoke('container-start', containerId, 'docker'),
  dockerRemove: (containerId) => ipcRenderer.invoke('container-remove', containerId, 'docker')
});
