<div align="center">

# ⚡ PORTFLOW

### *Network Port Monitor & Container Management for Linux*

<br>

[![Electron](https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Linux](https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://www.linux.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-326CE5?style=for-the-badge&logo=kubernetes&logoColor=white)](https://kubernetes.io/)

<br>

<img src="https://img.shields.io/badge/version-1.0.0-cyan?style=flat-square" alt="Version">
<img src="https://img.shields.io/badge/license-MIT-magenta?style=flat-square" alt="License">
<img src="https://img.shields.io/badge/platform-Linux-yellow?style=flat-square" alt="Platform">

<br><br>

*A sleek, cyberpunk-themed desktop application for monitoring network ports, managing port forwarding rules, and controlling containers across multiple runtimes.*

</div>

<br>

---

<br>

## 🎯 Overview

**Portflow** is a powerful Linux desktop application built with Electron that provides real-time monitoring and management of your system's network ports and containers. Featuring a distinctive **Corporate Dystopia Cyberpunk** aesthetic with neon glows, scanline effects, and a dark theme, Portflow makes system administration both functional and visually striking.

<br>

---

<br>

## ✨ Features

<table>
<tr>
<td width="50%">

### 🔌 Port Monitoring
- **Real-time TCP/UDP port listing**
- View listening ports with process information
- One-click process termination
- Automatic refresh every 3 seconds

</td>
<td width="50%">

### 🔀 Port Forwarding
- **iptables NAT rule visualization**
- SSH tunnel detection and display
- Elevated privilege support via `pkexec`
- Source/destination port mapping

</td>
</tr>
<tr>
<td width="50%">

### 📦 Container Management
- **Multi-runtime support** (Docker, Podman, Kubernetes)
- Automatic runtime detection
- Start, stop, and remove containers
- Real-time status monitoring

</td>
<td width="50%">

### 🎨 Cyberpunk UI
- **Neon glow effects** and scanlines
- Dark theme with cyan/magenta accents
- JetBrains Mono typography
- Animated status indicators

</td>
</tr>
</table>

<br>

---

<br>

## 🛠️ Tech Stack

| Category | Technologies |
|----------|-------------|
| **Framework** | ![Electron](https://img.shields.io/badge/Electron_40-47848F?style=flat-square&logo=electron&logoColor=white) |
| **Runtime** | ![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white) |
| **Frontend** | ![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white) ![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white) ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black) |
| **System Tools** | `ss` · `iptables` · `ps` · `kill` · `pkexec` |
| **Containers** | ![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white) ![Podman](https://img.shields.io/badge/Podman-892CA0?style=flat-square&logo=podman&logoColor=white) ![Kubernetes](https://img.shields.io/badge/kubectl-326CE5?style=flat-square&logo=kubernetes&logoColor=white) |

<br>

---

<br>

## 📋 Prerequisites

Before installing Portflow, ensure you have:

- **Linux** operating system (required)
- **Node.js** v18 or higher
- **npm** package manager

**Optional** (for container management):
- Docker daemon running
- Podman installed
- kubectl configured with cluster access

<br>

---

<br>

## 🚀 Installation

```bash
# Clone the repository
git clone https://github.com/AsjadLFC/Portflow.git

# Navigate to the project directory
cd Portflow

# Install dependencies
npm install

# Launch the application
npm start
```

<br>

---

<br>

## 📖 Usage

### Main Interface

Portflow organizes information into four main tabs:

| Tab | Description |
|-----|-------------|
| **TCP PORTS** | Displays all listening TCP ports with PID, process name, and address |
| **UDP PORTS** | Shows all listening UDP ports with connection details |
| **PORT FORWARDS** | Lists iptables NAT rules and active SSH tunnels |
| **CONTAINERS** | Unified view of Docker, Podman, and Kubernetes containers |

### Actions

- **Kill Process** — Terminate processes holding ports (with confirmation)
- **Elevated Kill** — Use `pkexec` for privileged process termination
- **Container Actions** — Start, stop, or remove containers across runtimes
- **Manual Refresh** — Force data refresh with the refresh button

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Escape` | Close modal dialogs |

<br>

---

<br>

## 🏗️ Project Structure

```
Portflow/
├── main.js              # Electron main process & IPC handlers
├── preload.js           # Secure context bridge for renderer
├── package.json         # Project configuration & dependencies
│
└── renderer/
    ├── index.html       # Application UI structure
    ├── styles.css       # Cyberpunk theme & styling
    └── app.js           # Client-side application logic
```

<br>

---

<br>

## 🔒 Security

Portflow follows Electron security best practices:

- ✅ Context isolation enabled
- ✅ Node integration disabled in renderer
- ✅ Secure IPC via `contextBridge`
- ✅ Input validation for PIDs and container IDs
- ✅ Explicit privilege elevation requests

<br>

---

<br>

## 🐧 Linux System Requirements

Portflow requires the following Linux utilities:

| Utility | Package | Purpose |
|---------|---------|---------|
| `ss` | iproute2 | Socket statistics |
| `iptables` | iptables | Firewall NAT rules |
| `ps` | procps | Process information |
| `pkexec` | polkit | Privilege elevation |

<br>

---

<br>

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

<br>

---

<br>

<div align="center">

### Built with 💜 for the Linux community

<br>

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/AsjadLFC/Portflow)

</div>
