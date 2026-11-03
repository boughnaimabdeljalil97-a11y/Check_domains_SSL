import type { VercelRequest, VercelResponse } from '@vercel/node';
import { jobManager } from '../server/jobManager.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id, allIssues } = req.body || {};
    if (allIssues) {
      const state = await jobManager.retryAllIssues();
      return res.status(200).json({ success: true, state });
    }
    if (!id) {
      return res.status(400).json({ error: 'Missing item id' });
    }

    const success = await jobManager.retryItem(id);
    const state = await jobManager.getFullState();
    return res.status(200).json({ success, state });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to retry' });
  }
}
