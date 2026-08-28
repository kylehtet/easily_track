// GET  /api/auth  → { configured, mode }   (is the login gate active?)
// POST /api/auth  { idToken } | { devPassword } → { token, email } | 401/403

import { authStatus, authVerify } from '../server/auth.js';
import { registerUser } from '../server/handlers.js';

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
    const { status, body, user } = await authVerify(payload || {});
    if (user) await registerUser(user);
    res.status(status).json(body);
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
}
