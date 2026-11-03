import type { VercelRequest, VercelResponse } from '@vercel/node';
import { jobManager } from '../server/jobManager.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const state = await jobManager.tickOrStatus();
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json(state);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to fetch status' });
  }
}
