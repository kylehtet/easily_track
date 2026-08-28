// Deploy wrapper (Vercel-style). GET loads the signed-in account's property
// list, PUT saves it, DELETE clears it. Every call is scoped to the uid in the
// session token — see server/auth.js and server/db.js.

import { dataGet, dataPut, dataDelete } from '../server/handlers.js';
import { sessionUser } from '../server/auth.js';

export default async function handler(req, res) {
  const user = sessionUser(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  if (req.method === 'GET') {
    const { status, body } = await dataGet(user);
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
    const { status, body } = await dataPut(user, payload || {});
    res.status(status).json(body);
    return;
  }

  if (req.method === 'DELETE') {
    const { status, body } = await dataDelete(user);
    res.status(status).json(body);
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
}
