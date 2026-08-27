import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/**
 * Serves /api/property and /api/extract-listing during `vite dev` using the
 * same handlers the deployed functions use (server/handlers.js). Secrets are
 * read from .env via loadEnv with an empty prefix, so they never get a VITE_
 * name and never reach the client bundle.
 */
function apiDevServer(env) {
  for (const k of [
    'RENTCAST_API_KEY',
    'ANTHROPIC_API_KEY',
    'LISTING_MODEL',
    'RAPIDAPI_KEY',
    'RAPIDAPI_ZILLOW_HOST',
    'REDFIN_ENABLED',
    'CENSUS_API_KEY',
    'KV_REST_API_URL',
    'KV_REST_API_TOKEN',
    'DATA_FILE',
    'FIREBASE_PROJECT_ID',
    'ALLOWED_EMAIL',
    'TOTP_SECRET',
    'SESSION_SECRET',
  ]) {
    if (env[k] && !process.env[k]) process.env[k] = env[k];
  }
  return {
    name: 'ledger-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        if (!url.pathname.startsWith('/api/')) return next();

        const send = (status, body) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };

        try {
          const {
            capabilities,
            propertyLookup,
            extractListing,
            dataGet,
            dataPut,
          } = await import('./server/handlers.js');
          const { authStatus, authVerify, requireSession } = await import(
            './server/auth.js'
          );

          // auth endpoint — never guarded
          if (url.pathname === '/api/auth' && req.method === 'GET') {
            const { status, body } = authStatus();
            return send(status, body);
          }
          if (url.pathname === '/api/auth' && req.method === 'POST') {
            let payload = {};
            try {
              payload = JSON.parse((await readBody(req)) || '{}');
            } catch {
              return send(400, { error: 'invalid JSON body' });
            }
            const { status, body } = await authVerify(payload);
            return send(status, body);
          }

          // everything else needs a valid session (when auth is configured)
          if (!requireSession(req.headers.authorization)) {
            return send(401, { error: 'unauthorized' });
          }

          if (url.pathname === '/api/data' && req.method === 'GET') {
            const { status, body } = await dataGet();
            return send(status, body);
          }
          if (url.pathname === '/api/data' && req.method === 'PUT') {
            let payload = {};
            try {
              payload = JSON.parse((await readBody(req)) || '{}');
            } catch {
              return send(400, { error: 'invalid JSON body' });
            }
            const { status, body } = await dataPut(payload);
            return send(status, body);
          }

          if (url.pathname === '/api/property' && req.method === 'GET') {
            const params = Object.fromEntries(url.searchParams);
            if (!params.address && !params.street) {
              return send(200, { configured: capabilities() });
            }
            const { status, body } = await propertyLookup(params);
            return send(status, body);
          }

          if (url.pathname === '/api/extract-listing' && req.method === 'POST') {
            let payload = {};
            try {
              payload = JSON.parse((await readBody(req)) || '{}');
            } catch {
              return send(400, { error: 'invalid JSON body' });
            }
            const { status, body } = await extractListing(payload);
            return send(status, body);
          }

          return send(404, { error: 'not found' });
        } catch (err) {
          return send(500, { error: err.message });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return { plugins: [react(), apiDevServer(env)] };
});
