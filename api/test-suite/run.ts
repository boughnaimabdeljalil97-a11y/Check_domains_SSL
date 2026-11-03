import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runFullTestSuite } from '../../server/testSuite.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const results = await runFullTestSuite();
    return res.status(200).json(results);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed running test suite' });
  }
}
