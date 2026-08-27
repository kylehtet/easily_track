// Deploy wrapper (Vercel-style signature). For other hosts, adapt the req/res
// shape but keep the calls into ../server/handlers.js identical.

import { capabilities, propertyLookup } from '../server/handlers.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const params = req.query || {};
  if (!params.address && !params.street) {
    res.status(200).json({ configured: capabilities() });
    return;
  }

  const { status, body } = await propertyLookup(params);
  res.status(status).json(body);
}
