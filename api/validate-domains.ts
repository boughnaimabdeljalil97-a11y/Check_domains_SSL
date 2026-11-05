import type { VercelRequest, VercelResponse } from '@vercel/node';
import { jobManager } from '../server/jobManager.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rawInput = req.body?.domains;
    const lines = typeof rawInput === 'string' ? rawInput.split(/\r?\n/) : Array.isArray(rawInput) ? rawInput : [];

    const valid: string[] = [];
    const invalid: string[] = [];
    const duplicates: string[] = [];
    const seen = new Set<string>();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const normalized = jobManager.normalizeDomain(trimmed);
      if (!normalized) {
        invalid.push(trimmed);
      } else if (seen.has(normalized)) {
        duplicates.push(trimmed);
      } else {
        seen.add(normalized);
        valid.push(normalized);
      }
    }

    return res.status(200).json({
      valid,
      invalid,
      duplicates,
      totalValid: valid.length,
      totalInvalid: invalid.length,
      totalDuplicates: duplicates.length
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to validate domains' });
  }
}
