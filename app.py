from fastapi import FastAPI, Request, Form, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
import json
import os
from datetime import datetime

app = FastAPI()

DATA_FILE = "data.json"

def read_data():
    if not os.path.exists(DATA_FILE):
        return {}
    with open(DATA_FILE, "r") as f:
        return json.load(f)

def write_data(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)

html_header = """
<!doctype html>
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
<body>
"""

def render_admin_page(data, flash_message="", order="slug"):
    # Sorting logic will be added later
    entries = sorted(data.items())
    total_hits = sum(item.get("hits", 0) for _, item in entries)

    rows = ""
    for slug, info in entries:
        last_access = "Nunca"
        if info.get("lastAccess"):
            last_access = datetime.fromtimestamp(info["lastAccess"] / 1000).strftime('%Y-%m-%d %H:%M:%S')

        rows += f"""
        <tr>
            <td><a href="{info['url']}" target="_blank" rel="noopener noreferrer"><code>{slug}</code></a></td>
            <td>
                <form class="inline" method="POST" action="/admin/update?order={order}">
                    <input type="hidden" name="slug" value="{slug}" />
                    <input type="hidden" name="order" value="{order}" />
                    <input name="target" value="{info['url']}" />
                    <button type="submit">Guardar</button>
                </form>
            </td>
            <td>{info.get('hits', 0)}</td>
            <td>{last_access}</td>
            <td>
                <form method="POST" action="/admin/delete?order={order}" onsubmit="return confirm('Eliminar {slug}?');">
                    <input type="hidden" name="slug" value="{slug}" />
                    <input type="hidden" name="order" value="{order}" />
                    <button class="danger" type="submit">Eliminar</button>
                </form>
            </td>
        </tr>
        """

    return f"""{html_header}
    <div class="card">
        <h1>Mantenedor de links: slugs</h1>
        <p class="muted">Slug: short links amigables</p>
        <form method="POST" action="/admin/create?order={order}">
            <input name="slug" placeholder="nombre (ej: emol)" required />
            <input name="target" placeholder="https://destino.com" required />
            <input type="hidden" name="order" value="{order}" />
            <button type="submit">Crear</button>
        </form>
        {f'<div class="flash">{flash_message}</div>' if flash_message else ""}
        <form class="inline" method="GET" action="/admin">
            <label class="muted">Ordenar por</label>
            <select name="order" onchange="this.form.submit()">
                <option value="slug"{' selected' if order == 'slug' else ''}>Nombre (A-Z)</option>
                <option value="hits"{' selected' if order == 'hits' else ''}>Uso (desc)</option>
                <option value="last"{' selected' if order == 'last' else ''}>Último acceso</option>
            </select>
        </form>
        <table>
            <thead>
                <tr><th>Slug</th><th>Destino</th><th>Usos</th><th>Último acceso</th><th></th></tr>
            </thead>
            <tbody>
                {rows or '<tr><td colspan="5" class="muted">Aún no hay links</td></tr>'}
            </tbody>
        </table>
        <p class="muted">Total clics: {total_hits}</p>
    </div>
    </body></html>
    """

@app.get("/", response_class=RedirectResponse)
async def root():
    return "/admin"

@app.get("/admin", response_class=HTMLResponse)
async def admin_page(order: str = "slug"):
    data = read_data()
    return render_admin_page(data, order=order)

@app.post("/admin/create")
async def create_link(slug: str = Form(...), target: str = Form(...), order: str = Form("slug")):
    data = read_data()
    if slug in data:
        return HTMLResponse(render_admin_page(data, f"El slug '{slug}' ya existe.", order=order), status_code=400)
    
    data[slug] = {"url": target, "createdAt": int(datetime.now().timestamp() * 1000), "updatedAt": int(datetime.now().timestamp() * 1000), "hits": 0, "lastAccess": None}
    write_data(data)
    return HTMLResponse(render_admin_page(data, f"Creado {slug} -> {target}", order=order))

@app.post("/admin/update")
async def update_link(slug: str = Form(...), target: str = Form(...), order: str = Form("slug")):
    data = read_data()
    if slug not in data:
        return HTMLResponse(render_admin_page(data, f"No existe el slug '{slug}'.", order=order), status_code=404)
    
    data[slug]["url"] = target
    data[slug]["updatedAt"] = int(datetime.now().timestamp() * 1000)
    write_data(data)
    return HTMLResponse(render_admin_page(data, f"Actualizado {slug}.", order=order))

@app.post("/admin/delete")
async def delete_link(slug: str = Form(...), order: str = Form("slug")):
    data = read_data()
    if slug not in data:
        return HTMLResponse(render_admin_page(data, f"No existe el slug '{slug}'.", order=order), status_code=404)
    
    del data[slug]
    write_data(data)
    return HTMLResponse(render_admin_page(data, f"Eliminado {slug}.", order=order))

@app.get("/{slug}", response_class=RedirectResponse)
async def redirect(slug: str):
    data = read_data()
    if slug in data:
        data[slug]["hits"] = data[slug].get("hits", 0) + 1
        data[slug]["lastAccess"] = int(datetime.now().timestamp() * 1000)
        write_data(data)
        return data[slug]["url"]
    else:
        return HTMLResponse(f"No existe el link '{slug}'.", status_code=404)
