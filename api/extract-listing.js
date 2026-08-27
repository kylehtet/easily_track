// Deploy wrapper (Vercel-style signature). For other hosts, adapt the req/res
// shape but keep the call into ../server/handlers.js identical.

import { extractListing } from '../server/handlers.js';
import { requireSession } from '../server/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  if (!requireSession(req.headers.authorization)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}');
    } catch {
      res.status(400).json({ error: 'invalid JSON body' });
      return;
    }
  }

  const { status, body } = await extractListing(payload || {});
  res.status(status).json(body);
}
