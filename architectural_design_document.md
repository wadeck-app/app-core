# Architecture Document: Modular Manager Dashboard (Core + External Plugins)

This document outlines the architecture for a local, modular manager dashboard application powered by a single Node.js backend, a dynamic React frontend, local JSON file storage, and standalone external CLI data synchronizers.

---

## 1. High-Level Architecture Overview

The system is split into three main decoupled layers:
1. **The Core Application (`manager-dashboard-core`):** A unified monorepo or single installation containing the Node.js server and React frontend shell. It handles routing, extension points (slots), configuration, and dynamic plugin loading.
2. **External Plugins (Standalone Repositories):** Independent Git repositories (e.g., `plugin-github`, `plugin-slack`, `plugin-gitlab`) compiled into self-contained packages. Each plugin provides both its backend logic (API endpoints, event hooks) and its frontend UI components.
3. **Standalone CLIs (Data Ingestors):** Independent CLI tools run via cron or manually 1-2 times a day. They fetch data from external APIs (GitHub, Slack, etc.) and push it directly into the local storage layer.

---

## 2. Technology Stack & Storage Philosophy

* **Backend:** Node.js (ESM native), using a modular web framework like **Fastify** or **Express** for easy dynamic route registration.
* **Frontend:** React (Vite-based) with a dynamic shell architecture capable of rendering widgets and pages injected by active plugins.
* **Database / Storage:** **No traditional database.** Data is stored locally in isolated **JSON files** managed per plugin to avoid complexity and ensure zero-friction local execution.
* **Plugin Distribution:** Standalone packages or local directories registered via a configuration file (`config/plugins.json`).

---

## 3. Detailed Component Breakdown

### A. The Core Backend & Plugin Loader
The server starts up, reads the configuration file, and dynamically imports enabled plugins.

* **Lifecycle:**
  1. Load `config/plugins.json` (lists active plugin package names/paths).
  2. For each plugin, dynamically load its backend entry point using native ESM `import()` or `require()`.
  3. Execute a registration hook (e.g., `registerPlugin({ app, storage, router })`) allowing the plugin to register its own API routes and background tasks.

* **File-Based Storage Service:**
  * The Core provides a utility to plugins for reading/writing isolated JSON files (e.g., `data/plugins/github.json`).
  * Writes use atomic operations (write to temp file then rename) to prevent JSON corruption.

* **CLI Ingestion Endpoint:**
  * Standalone CLI scrapers push synchronized data to a secure internal API route provided by the core/plugin (e.g., `POST /api/internal/ingest/:pluginId`), or directly update the plugin's JSON data file.

### B. The Core Frontend & Extension Points (Slots)
The React client does not hardcode features. Instead, it queries the backend at startup (`GET /api/manifests`) to discover active plugins and their UI capabilities.

* **Extension Points (Slots):**
  * **Widgets:** Small cards displayed on the main dashboard grid.
  * **Pages/Tabs:** Full views added to the navigation bar.
  * **Table Columns / Actions:** Extensions integrated into existing core tables or report views.

* **Dynamic Component Loading:**
  * Plugins provide a compiled frontend bundle (e.g., ESM format).
  * The frontend shell dynamically imports or evaluates these bundles at runtime to render plugin-specific components inside the defined slots.

---

## 4. Plugin Contract & Repository Structure

Every external plugin (e.g., your team's GitHub or GitLab module) is built in its own repository following a standardized contract:

```text
manager-plugin-template/
+-- package.json          # Dependencies & build scripts
+-- manifest.json         # Metadata (id, name, version, targets)
+-- src/
|   +-- backend.ts        # Node.js logic, API routes, data transformers
|   +-- frontend.tsx      # React components (widgets, config pages)
+-- dist/
    +-- backend.js        # Compiled CommonJS/ESM for Node.js server
    +-- frontend.js       # Compiled bundle for React UI injection
```

### Example `manifest.json`:
```json
{
  "id": "github-scm",
  "name": "GitHub Pull Requests",
  "version": "1.0.0",
  "type": "scm",
  "backendEntry": "./dist/backend.js",
  "frontendEntry": "./dist/frontend.js",
  "extensionPoints": {
    "dashboardWidgets": ["GitHubPRWidget"],
    "reportTabs": ["GitHubActivityTab"]
  }
}
```

---

## 5. Workflow for Team Members & CLIs

1. **SCM Customization per Team:**
   * If Team A uses GitHub, they enable `manager-plugin-github`.
   * If Team B uses GitLab, they enable `manager-plugin-gitlab`.
   * The core application and UI adapt automatically based on the active plugins list in `config/plugins.json`.

2. **Data Synchronization (CLIs):**
   * A developer runs their daily CLI tool: `npx sync-github-cli --user=manager`.
   * The CLI fetches raw data, transforms it, and saves it to the local JSON store (or pushes it to the local Node.js server endpoint).
   * The dashboard instantly reflects the fresh data on the next refresh without needing a full application database or complex state management.