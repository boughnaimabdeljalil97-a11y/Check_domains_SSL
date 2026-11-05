import type { VercelRequest, VercelResponse } from '@vercel/node';
import { exportToCsv } from '../../server/jobManager.js';
import type { DomainItem } from '../../server/types.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const items: DomainItem[] = req.body?.items || [];
    const csvData = exportToCsv(items);
    const filename = `domain-inspector-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvData);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to export CSV' });
  }
}
