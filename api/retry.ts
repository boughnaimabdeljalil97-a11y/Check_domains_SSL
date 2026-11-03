import type { VercelRequest, VercelResponse } from '@vercel/node';
import { inspectDomains, parseInputDomains } from '../server/jobManager.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { domains, domain, settings } = req.body || {};
    const targetDomains = domains || (domain ? [domain] : []);

    const parsed = parseInputDomains(targetDomains);
    if (parsed.length === 0) {
      return res.status(400).json({ error: 'No valid domains provided to retry' });
    }

    const state = await inspectDomains(parsed, settings);
    return res.status(200).json({ success: true, items: state.items, state });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to retry domains' });
  }
}
