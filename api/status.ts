import type { VercelRequest, VercelResponse } from '@vercel/node';
import { DEFAULT_STATE } from '../server/jobManager.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(200).json(DEFAULT_STATE);
}
