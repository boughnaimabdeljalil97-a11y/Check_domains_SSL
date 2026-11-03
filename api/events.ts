import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const acceptHeader = (req.headers.accept || '').toLowerCase();
  if (acceptHeader.includes('text/event-stream')) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.write('data: {"event":"connected","message":"stateless"}\n\n');
    res.end();
    return;
  }
  return res.status(200).json({ status: 'stateless_mode' });
}
