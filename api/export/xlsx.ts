import type { VercelRequest, VercelResponse } from '@vercel/node';
import { exportToExcel } from '../../server/jobManager.js';
import type { DomainItem } from '../../server/types.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const items: DomainItem[] = req.body?.items || [];
    const buffer = exportToExcel(items);
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
