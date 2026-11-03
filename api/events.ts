import type { VercelRequest, VercelResponse } from '@vercel/node';
import { jobManager } from '../server/jobManager.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const state = await jobManager.getFullState();

    const acceptHeader = (req.headers.accept || '').toLowerCase();
    if (acceptHeader.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');

      res.write(`data: ${JSON.stringify({ event: 'initial_state', state })}\n\n`);
      res.end();
      return;
    }

    return res.status(200).json({ event: 'state_snapshot', state });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed in events handler' });
  }
}
