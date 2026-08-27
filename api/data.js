// Deploy wrapper (Vercel-style). GET loads the stored property list, PUT saves
// it. Backed by ../server/dataStore.js (KV or a JSON file).

import { dataGet, dataPut } from '../server/handlers.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { status, body } = await dataGet();
    res.status(status).json(body);
    return;
  }

  if (req.method === 'PUT') {
    let payload = req.body;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload || '{}');
      } catch {
        res.status(400).json({ error: 'invalid JSON body' });
        return;
      }
    }
    const { status, body } = await dataPut(payload || {});
    res.status(status).json(body);
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
}
