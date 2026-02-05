/**
 * HTML Templates for Admin Interface
 * Separated from server.js for cleaner architecture
 */

const createAssistantHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Create Assistant</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    label { display: block; margin: 12px 0 4px; }
    input, textarea { width: 100%; max-width: 600px; padding: 8px; }
    button { margin-top: 16px; padding: 10px 16px; }
  </style>
</head>
<body>
  <h1>Create Assistant</h1>
  <p>This is a local placeholder page. Use it to create new assistants for testing.</p>
  <label>Name</label>
  <input id="name" placeholder="Assistant name" />
  <label>Description</label>
  <input id="description" placeholder="Short description" />
  <label>System Prompt</label>
  <textarea id="systemPrompt" rows="6" placeholder="System prompt"></textarea>
  <br />
  <button onclick="createAssistant()">Create</button>
  <pre id="result"></pre>
  <script>
    async function createAssistant() {
      const payload = {
        name: document.getElementById('name').value,
        description: document.getElementById('description').value,
        systemPrompt: document.getElementById('systemPrompt').value
      };
      const res = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      document.getElementById('result').textContent = JSON.stringify(json, null, 2);
    }
  </script>
</body>
</html>`;

const vectorAdminHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Vector Admin</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    nav a { margin-right: 12px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; vertical-align: top; }
    th { background: #f5f5f5; text-align: left; }
    button { padding: 6px 10px; }
    #pager { margin-top: 12px; color: #444; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <nav>
    <a href="/admin/vectors">Vectors</a>
    <a href="/admin/transcripts">Transcripts</a>
  </nav>
  <h1>Vector Store Admin</h1>
  <p>Manage locally stored vectors for Meeting Assistant.</p>
  <div>
    <button id="refreshBtn">Refresh</button>
  </div>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Preview</th>
        <th>Metadata</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>
  <div id="pager"></div>

  <script>
    let offset = 0;
    const limit = 25;

    async function refresh() {
      const url = '/api/admin/vectors?offset=' + offset + '&limit=' + limit;
      const res = await fetch(url);
      const json = await res.json();
      const rows = document.getElementById("rows");
      rows.innerHTML = "";
      (json.items || []).forEach((item) => {
        const tr = document.createElement("tr");

        const tdId = document.createElement("td");
        tdId.textContent = String(item.id || "");

        const tdPreview = document.createElement("td");
        tdPreview.textContent = String(item.text || "").slice(0, 140);

        const tdMeta = document.createElement("td");
        const pre = document.createElement("pre");
        pre.textContent = JSON.stringify(item.metadata || {}, null, 2);
        tdMeta.appendChild(pre);

        const tdActions = document.createElement("td");
        const btn = document.createElement("button");
        btn.textContent = "Delete";
        btn.addEventListener("click", () => removeVector(String(item.id || "")));
        tdActions.appendChild(btn);

        tr.appendChild(tdId);
        tr.appendChild(tdPreview);
        tr.appendChild(tdMeta);
        tr.appendChild(tdActions);
        rows.appendChild(tr);
      });

      const pager = document.getElementById("pager");
      const total = (json.total === null || json.total === undefined) ? "unknown" : String(json.total);
      pager.textContent = "Offset " + String(json.offset) + ", showing " + String((json.items || []).length) + ", total " + total;
    }

    async function removeVector(id) {
      if (!id) { return; }
      if (!confirm("Delete vector " + id + "?")) { return; }
      await fetch("/api/admin/vectors/" + encodeURIComponent(id), { method: "DELETE" });
      refresh();
    }

    document.getElementById("refreshBtn").addEventListener("click", refresh);
    refresh();
  </script>
</body>
</html>`;

const transcriptAdminHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Transcript Admin</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    nav a { margin-right: 12px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; }
    th { background: #f5f5f5; text-align: left; }
    button { padding: 6px 10px; margin-right: 8px; }
    #meta { margin: 12px 0; color: #444; }
  </style>
</head>
<body>
  <nav>
    <a href="/admin/vectors">Vectors</a>
    <a href="/admin/transcripts">Transcripts</a>
  </nav>
  <h1>Transcript Ingestion</h1>
  <p>Status for transcript files in <code>data/transcripts</code>.</p>
  <div id="meta"></div>
  <div>
    <button id="refreshBtn">Refresh</button>
    <button id="scanBtn">Run scan now</button>
  </div>
  <table>
    <thead>
      <tr>
        <th>Filename</th>
        <th>Size</th>
        <th>Modified</th>
        <th>Ingested</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>

  <script>
    async function runScan() {
      await fetch("/api/admin/transcripts/scan", { method: "POST" });
      refresh();
    }

    async function reingest(name) {
      if (!name) { return; }
      await fetch("/api/admin/transcripts/reingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      refresh();
    }

    async function refresh() {
      const res = await fetch("/api/admin/transcripts");
      const json = await res.json();
      const rows = document.getElementById("rows");
      rows.innerHTML = "";
      (json.files || []).forEach((item) => {
        const tr = document.createElement("tr");

        const tdName = document.createElement("td");
        tdName.textContent = String(item.name || "");

        const tdSize = document.createElement("td");
        tdSize.textContent = String(item.size || "");

        const tdMod = document.createElement("td");
        tdMod.textContent = String(item.modified || "");

        const tdIng = document.createElement("td");
        tdIng.textContent = item.ingested ? "yes" : "no";

        const tdActions = document.createElement("td");
        const btn = document.createElement("button");
        btn.textContent = "Re-ingest";
        btn.addEventListener("click", () => reingest(String(item.name || "")));
        tdActions.appendChild(btn);

        tr.appendChild(tdName);
        tr.appendChild(tdSize);
        tr.appendChild(tdMod);
        tr.appendChild(tdIng);
        tr.appendChild(tdActions);
        rows.appendChild(tr);
      });

      const meta = document.getElementById("meta");
      const lastScan = json.lastScan || "never";
      const lastCount = (json.lastScanCount === null || json.lastScanCount === undefined) ? "0" : String(json.lastScanCount);
      meta.textContent = "Last scan: " + lastScan + " | Last ingest count: " + lastCount;
    }

    document.getElementById("refreshBtn").addEventListener("click", refresh);
    document.getElementById("scanBtn").addEventListener("click", runScan);
    refresh();
  </script>
</body>
</html>`;

module.exports = {
    createAssistantHtml,
    vectorAdminHtml,
    transcriptAdminHtml
};
