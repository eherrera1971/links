const http = require("http");
const https = require("https");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data.json");
const HTTP_PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || path.join(__dirname, "localhost-key.pem");
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || path.join(__dirname, "localhost.pem");

const htmlHeader = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin Links</title>
  <style>
    :root {
      font-family: "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      background: #f8fafc;
    }
    body { margin: 0; padding: 24px; }
    h1 { margin: 0 0 16px; font-size: 24px; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; box-shadow: 0 8px 24px rgba(15,23,42,0.06); }
    form { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    input { padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; min-width: 160px; }
    button { padding: 8px 12px; border: none; border-radius: 6px; background: #2563eb; color: white; cursor: pointer; }
    button.danger { background: #dc2626; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: left; }
    th { background: #f1f5f9; }
    .flash { margin-top: 12px; padding: 10px; border-radius: 6px; background: #ecfeff; border: 1px solid #22d3ee; color: #0f172a; }
    .muted { color: #64748b; }
    .inline { display: inline-flex; gap: 6px; align-items: center; }
  </style>
</head>
<body>`;

async function readData() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    if (err.code === "ENOENT") return {};
    console.error("Error leyendo data:", err);
    return {};
  }
}

async function writeData(data) {
  const payload = JSON.stringify(data, null, 2);
  await fs.writeFile(DATA_FILE, payload, "utf8");
}

function isValidSlug(slug) {
  return /^[a-zA-Z0-9._-]+$/.test(slug);
}

function normalizeUrl(target) {
  try {
    const hasScheme = /^https?:\/\//i.test(target);
    const url = new URL(hasScheme ? target : `https://${target}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch (_err) {
    return null;
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk.toString();
      if (body.length > 1e6) {
        req.connection.destroy();
        reject(new Error("Payload demasiado grande"));
      }
    });
    req.on("end", () => {
      const params = new URLSearchParams(body);
      const result = {};
      for (const [key, value] of params.entries()) {
        result[key] = value.trim();
      }
      resolve(result);
    });
  });
}

function sortEntries(entries, order) {
  if (order === "hits") {
    return entries.sort((a, b) => (b[1].hits || 0) - (a[1].hits || 0) || a[0].localeCompare(b[0]));
  }
  if (order === "last") {
    return entries.sort((a, b) => (b[1].lastAccess || 0) - (a[1].lastAccess || 0) || a[0].localeCompare(b[0]));
  }
  return entries.sort((a, b) => a[0].localeCompare(b[0]));
}

function renderAdminPage(data, flashMessage = "", order = "slug") {
  const entries = sortEntries(Object.entries(data), order);
  const totalHits = entries.reduce((acc, [, info]) => acc + (info.hits || 0), 0);

  const rows = entries
    .map(([slug, info]) => {
      const last = info.lastAccess ? new Date(info.lastAccess).toLocaleString("es-CL") : "Nunca";
      return `<tr>
        <td><code>${slug}</code></td>
        <td>
          <form class="inline" method="POST" action="/admin/update?order=${order}">
            <input type="hidden" name="slug" value="${slug}" />
            <input type="hidden" name="order" value="${order}" />
            <input name="target" value="${info.url}" />
            <button type="submit">Guardar</button>
          </form>
        </td>
        <td>${info.hits || 0}</td>
        <td>${last}</td>
        <td>
          <form method="POST" action="/admin/delete?order=${order}" onsubmit="return confirm('Eliminar ${slug}?');">
            <input type="hidden" name="slug" value="${slug}" />
            <input type="hidden" name="order" value="${order}" />
            <button class="danger" type="submit">Eliminar</button>
          </form>
        </td>
      </tr>`;
    })
    .join("");

  return `${htmlHeader}
  <div class="card">
    <h1>Mantenedor de links</h1>
    <form method="POST" action="/admin/create?order=${order}">
      <input name="slug" placeholder="nombre (ej: emol)" required />
      <input name="target" placeholder="https://destino.com" required />
      <input type="hidden" name="order" value="${order}" />
      <button type="submit">Crear</button>
      <span class="muted">Formato de slug: letras, números, -, _, .</span>
    </form>
    ${flashMessage ? `<div class="flash">${flashMessage}</div>` : ""}
    <form class="inline" method="GET" action="/admin">
      <label class="muted">Ordenar por</label>
      <select name="order" onchange="this.form.submit()">
        <option value="slug"${order === "slug" ? " selected" : ""}>Nombre (A-Z)</option>
        <option value="hits"${order === "hits" ? " selected" : ""}>Uso (desc)</option>
        <option value="last"${order === "last" ? " selected" : ""}>Último acceso</option>
      </select>
    </form>
    <table>
      <thead>
        <tr><th>Slug</th><th>Destino</th><th>Usos</th><th>Último acceso</th><th></th></tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="5" class="muted">Aún no hay links</td></tr>`}
      </tbody>
    </table>
    <p class="muted">Total clics: ${totalHits}</p>
  </div>
</body></html>`;
}

async function handleAdminCreate(res, body) {
  const slug = body.slug;
  const target = normalizeUrl(body.target);
  const order = body.order || "slug";
  if (!isValidSlug(slug)) return sendAdmin(res, undefined, "Slug inválido. Usa letras, números, punto, guion o guion bajo.", order);
  if (!target) return sendAdmin(res, undefined, "URL de destino inválida.", order);

  const data = await readData();
  if (data[slug]) return sendAdmin(res, data, `El slug "${slug}" ya existe.`, order);
  data[slug] = { url: target, createdAt: Date.now(), updatedAt: Date.now(), hits: 0, lastAccess: null };
  await writeData(data);
  return sendAdmin(res, data, `Creado ${slug} -> ${target}`, order);
}

async function handleAdminUpdate(res, body) {
  const slug = body.slug;
  const target = normalizeUrl(body.target);
  const order = body.order || "slug";
  if (!isValidSlug(slug)) return sendAdmin(res, undefined, "Slug inválido.", order);
  if (!target) return sendAdmin(res, undefined, "URL de destino inválida.", order);

  const data = await readData();
  if (!data[slug]) return sendAdmin(res, data, `No existe el slug "${slug}".`, order);
  data[slug] = { ...data[slug], url: target, updatedAt: Date.now() };
  await writeData(data);
  return sendAdmin(res, data, `Actualizado ${slug}.`, order);
}

async function handleAdminDelete(res, body) {
  const slug = body.slug;
  const order = body.order || "slug";
  const data = await readData();
  if (!data[slug]) return sendAdmin(res, data, `No existe el slug "${slug}".`, order);
  delete data[slug];
  await writeData(data);
  return sendAdmin(res, data, `Eliminado ${slug}.`, order);
}

async function sendAdmin(res, data, message, order = "slug") {
  const payload = renderAdminPage(data || (await readData()), message || "", order);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(payload);
}

async function handleRedirect(req, res, slug) {
  const data = await readData();
  const record = data[slug];
  if (!record) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`No existe el link "${slug}".`);
    return;
  }

  record.hits = (record.hits || 0) + 1;
  record.lastAccess = Date.now();
  await writeData(data);

  res.writeHead(302, { Location: record.url });
  res.end();
}

async function appHandler(req, res) {
  const { method } = req;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    if (pathname === "/" && method === "GET") {
      res.writeHead(302, { Location: "/admin" });
      res.end();
      return;
    }

    if (pathname === "/admin" && method === "GET") {
      const orderParam = url.searchParams.get("order");
      const order = ["slug", "hits", "last"].includes(orderParam) ? orderParam : "slug";
      await sendAdmin(res, undefined, "", order);
      return;
    }

    if (pathname === "/admin/create" && method === "POST") {
      const body = await parseBody(req);
      await handleAdminCreate(res, body);
      return;
    }

    if (pathname === "/admin/update" && method === "POST") {
      const body = await parseBody(req);
      await handleAdminUpdate(res, body);
      return;
    }

    if (pathname === "/admin/delete" && method === "POST") {
      const body = await parseBody(req);
      await handleAdminDelete(res, body);
      return;
    }

    if (method === "GET") {
      const slug = pathname.startsWith("/") ? pathname.slice(1) : pathname;
      if (!slug || slug.includes("/")) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Recurso no encontrado.");
        return;
      }
      await handleRedirect(req, res, slug);
      return;
    }

    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Método no permitido.");
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Error interno");
  }
}

let httpsOptions = null;
try {
  const key = fsSync.readFileSync(SSL_KEY_PATH);
  const cert = fsSync.readFileSync(SSL_CERT_PATH);
  httpsOptions = { key, cert };
} catch (err) {
  console.warn("No se pudo cargar certificado SSL, sirviendo solo HTTP. Detalle:", err.message);
}

if (httpsOptions) {
  const httpsServer = https.createServer(httpsOptions, appHandler);
  httpsServer.listen(HTTPS_PORT, () => {
    const host = process.env.SSL_HOST || "localhost";
    const portSuffix = HTTPS_PORT === 443 ? "" : `:${HTTPS_PORT}`;
    console.log(`HTTPS listo en https://${host}${portSuffix}`);
  });

  const httpRedirect = http.createServer((req, res) => {
    const hostHeader = req.headers.host || `localhost:${HTTP_PORT}`;
    const hostOnly = hostHeader.split(":")[0];
    const portSuffix = HTTPS_PORT === 443 ? "" : `:${HTTPS_PORT}`;
    res.writeHead(301, { Location: `https://${hostOnly}${portSuffix}${req.url}` });
    res.end();
  });
  httpRedirect.listen(HTTP_PORT, () => {
    console.log(`HTTP redirigiendo a HTTPS en http://localhost:${HTTP_PORT}`);
  });
} else {
  const server = http.createServer(appHandler);
  server.listen(HTTP_PORT, () => {
    console.log(`Servidor HTTP listo en http://localhost:${HTTP_PORT}`);
  });
}
