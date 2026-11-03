import type { VercelRequest, VercelResponse } from '@vercel/node';
import { jobManager } from '../../server/jobManager.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const buffer = await jobManager.exportToExcel();
    const filename = `domain-inspector-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to export Excel' });
  }
}
