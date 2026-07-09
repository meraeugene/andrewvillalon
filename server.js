const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = process.env.PORT || 4173;
const ADMIN_PIN = "022104";
const ROOT_DIR = __dirname;
const PROJECTS_FILE = path.join(ROOT_DIR, "projects.json");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function normalizeProject(project) {
  const tags = Array.isArray(project.tags)
    ? project.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];

  return {
    name: String(project.name || "").trim(),
    year: String(project.year || "").trim(),
    description: String(project.description || "").trim(),
    tags,
    imageUrl: String(project.imageUrl || "").trim(),
    liveUrl: String(project.liveUrl || "").trim(),
    githubUrl: String(project.githubUrl || "").trim(),
    createdAt: project.createdAt || new Date().toISOString(),
  };
}

function validateProject(project) {
  if (!project.name) return "Project name is required.";
  if (!project.year) return "Project year is required.";
  if (!project.description) return "Project description is required.";
  if (!project.tags.length) return "At least one tag is required.";
  if (!project.imageUrl) return "Image path or URL is required.";
  return "";
}

async function handleProjectCreate(request, response) {
  try {
    const body = await readRequestBody(request);
    const payload = JSON.parse(body || "{}");

    if (String(payload.pin || "") !== ADMIN_PIN) {
      sendJson(response, 403, { error: "Incorrect PIN." });
      return;
    }

    const project = normalizeProject(payload.project || {});
    const validationError = validateProject(project);
    if (validationError) {
      sendJson(response, 400, { error: validationError });
      return;
    }

    const projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, "utf8"));
    if (!Array.isArray(projects)) {
      sendJson(response, 500, { error: "projects.json must contain an array." });
      return;
    }

    projects.unshift(project);
    fs.writeFileSync(PROJECTS_FILE, `${JSON.stringify(projects, null, 2)}\n`);
    sendJson(response, 201, { project });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Unable to save project." });
  }
}

function resolveStaticPath(urlPath) {
  let requestPath = decodeURIComponent(urlPath.split("?")[0]);

  if (requestPath === "/") requestPath = "/index.html";
  if (requestPath.endsWith("/")) requestPath += "index.html";

  const filePath = path.normalize(path.join(ROOT_DIR, requestPath));
  if (!filePath.startsWith(ROOT_DIR)) return "";
  return filePath;
}

function serveStaticFile(request, response) {
  const filePath = resolveStaticPath(request.url || "/");

  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
  });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer((request, response) => {
  if (request.method === "POST" && request.url === "/api/projects") {
    handleProjectCreate(request, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
    return;
  }

  serveStaticFile(request, response);
});

server.listen(PORT, () => {
  console.log(`Portfolio admin server running at http://127.0.0.1:${PORT}`);
});
