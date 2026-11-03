import type { VercelRequest, VercelResponse } from '@vercel/node';
import { jobManager } from '../server/jobManager.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { domains, settings } = req.body || {};
    if (!domains || (!Array.isArray(domains) && typeof domains !== 'string')) {
      return res.status(400).json({ error: 'Domains must be an array of strings or a multiline string' });
    }

    const state = await jobManager.startJob(domains, settings);
    return res.status(200).json({ success: true, state });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to start inspection' });
  }
}
