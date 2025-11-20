# Links (shortener local)

Pequeño servidor Node sin dependencias externas que permite crear slugs y redirigirlos a URLs, con panel de administración y métricas de uso.

## Requisitos
- Node.js 18+ (probado con 20+).

## Instalación y ejecución
```bash
npm install   # no instala dependencias pero inicializa el lock si lo quieres
npm start     # HTTP en :3000, HTTPS opcional en :3443
```
- Admin: `http://localhost:3000/admin` (o HTTPS si lo configuras).
- Acceso a slugs: `http://localhost:3000/<slug>`.

## Funciones clave
- Crear/editar/eliminar slugs desde `/admin`.
- Conteo de clics y última fecha de acceso.
- Ordenar la tabla por nombre, número de usos o último acceso.
- Si ingresas una URL sin `http://` o `https://`, se prepende automáticamente `https://`.
- Al abrir `/` redirige a `/admin`.

## Datos
- Los enlaces se guardan en `data.json` en la raíz del proyecto (formato JSON simple). No hay base de datos.

## HTTPS opcional (local)
1. Genera un certificado para `localhost` (ej. con `mkcert`):
   ```bash
   mkcert localhost 127.0.0.1 ::1
   mv localhost+*.pem localhost.pem
   mv localhost+*-key.pem localhost-key.pem
   ```
2. Ubica `localhost.pem` y `localhost-key.pem` en la raíz del proyecto.
3. Levanta el server (usa `PORT` y `HTTPS_PORT` si quieres otros puertos):
   ```bash
   SSL_CERT_PATH=./localhost.pem \
   SSL_KEY_PATH=./localhost-key.pem \
   npm start
   ```
4. Abre `https://localhost:3443/admin` (HTTP en :3000 redirige a HTTPS).

Si los `.pem` no están, el servidor arranca solo en HTTP y muestra un aviso en consola.

## Variables de entorno útiles
- `PORT`: puerto HTTP (default `3000`).
- `HTTPS_PORT`: puerto HTTPS (default `3443`).
- `SSL_CERT_PATH`, `SSL_KEY_PATH`: rutas a los archivos `.pem` si no usas los nombres por defecto.
- `SSL_HOST`: host a mostrar en el log (solo informativo).

## Flujo rápido
1. Ejecuta `npm start`.
2. Entra a `/admin`, crea un slug (ej. `emol`) y destino (ej. `emol.com` → se guardará como `https://emol.com`).
3. Visita `http://localhost:3000/emol`; el contador y último acceso se reflejarán en `/admin`.

## Notas
- No hay autenticación; úsalo solo en entornos de confianza.
- Evita editar `data.json` a mano mientras el servidor corre para no perder cambios.
