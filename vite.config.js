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
    'DATABASE_URL',
    'FIREBASE_PROJECT_ID',
    'SESSION_SECRET',
    'AUTH_DEV_PASSWORD',
  ]) {
    if (env[k] && !process.env[k]) process.env[k] = env[k];
  }
  return {
    name: 'ledger-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        let url;
        try {
          url = new URL(req.url, 'http://localhost');
        } catch {
          return next();
        }
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
            registerUser,
            dataGet,
            dataPut,
            dataDelete,
          } = await import('./server/handlers.js');
          const { authStatus, authVerify, sessionUser } = await import(
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
            const { status, body, user } = await authVerify(payload);
            if (user) await registerUser(user);
            return send(status, body);
          }

          // everything else needs a valid session (when auth is configured)
          const user = sessionUser(req.headers.authorization);
          if (!user) {
            return send(401, { error: 'unauthorized' });
          }

          if (url.pathname === '/api/data' && req.method === 'GET') {
            const { status, body } = await dataGet(user);
            return send(status, body);
          }
          if (url.pathname === '/api/data' && req.method === 'PUT') {
            let payload = {};
            try {
              payload = JSON.parse((await readBody(req)) || '{}');
            } catch {
              return send(400, { error: 'invalid JSON body' });
            }
            const { status, body } = await dataPut(user, payload);
            return send(status, body);
          }
          if (url.pathname === '/api/data' && req.method === 'DELETE') {
            const { status, body } = await dataDelete(user);
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
