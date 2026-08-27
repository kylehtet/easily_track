// GET  /api/auth  → { configured: boolean }   (is the login gate active?)
// POST /api/auth  { idToken, code } → { token } | 401/403

import { authStatus, authVerify } from '../server/auth.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { status, body } = authStatus();
    res.status(status).json(body);
    return;
  }

  if (req.method === 'POST') {
    let payload = req.body;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload || '{}');
      } catch {
        res.status(400).json({ error: 'invalid JSON body' });
        return;
      }
    }
    const { status, body } = await authVerify(payload || {});
    res.status(status).json(body);
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
}
