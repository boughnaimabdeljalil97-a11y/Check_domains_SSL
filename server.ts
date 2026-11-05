import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { jobManager } from './server/jobManager.js';
import { runFullTestSuite } from './server/testSuite.js';
import { spamhausChecker } from './server/spamhausChecker.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '10mb' }));

  // SSE client connections
  const sseClients = new Set<Response>();

  jobManager.on('update', (data) => {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(payload);
      } catch {
        sseClients.delete(res);
      }
    }
  });

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // API Routes
  app.get('/api/status', (_req: Request, res: Response) => {
    res.json(jobManager.getFullState());
  });

  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // Send initial snapshot immediately
    res.write(`data: ${JSON.stringify({ event: 'initial_state', state: jobManager.getFullState() })}\n\n`);

    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  app.post('/api/validate-domains', (req: Request, res: Response) => {
    const rawInput = req.body.domains;
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

    res.json({
      valid,
      invalid,
      duplicates,
      totalValid: valid.length,
      totalInvalid: invalid.length,
      totalDuplicates: duplicates.length
    });
  });

  app.post('/api/start', (req: Request, res: Response) => {
    const { domains, settings } = req.body;
    if (!domains || (!Array.isArray(domains) && typeof domains !== 'string')) {
      return res.status(400).json({ error: 'Domains must be an array of strings or a multiline string' });
    }

    const state = jobManager.startJob(domains, settings);
    res.json({ success: true, state });
  });

  app.post('/api/pause', (_req: Request, res: Response) => {
    const state = jobManager.pauseJob();
    res.json({ success: true, state });
  });

  app.post('/api/resume', (_req: Request, res: Response) => {
    const state = jobManager.resumeJob();
    res.json({ success: true, state });
  });

  app.post('/api/stop', (_req: Request, res: Response) => {
    const state = jobManager.stopJob();
    res.json({ success: true, state });
  });

  app.post('/api/retry', (req: Request, res: Response) => {
    const { id, allIssues } = req.body;
    if (allIssues) {
      const state = jobManager.retryAllIssues();
      return res.json({ success: true, state });
    }
    if (!id) {
      return res.status(400).json({ error: 'Missing item id' });
    }
    const success = jobManager.retryItem(id);
    res.json({ success, state: jobManager.getFullState() });
  });

  app.post('/api/recheck-missing-whois', async (_req: Request, res: Response) => {
    const state = await jobManager.recheckMissingDates();
    res.json({ success: true, state });
  });

  app.get('/api/export/csv', (_req: Request, res: Response) => {
    const csvData = jobManager.exportToCsv();
    const filename = `domain-inspector-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvData);
  });

  app.get('/api/export/xlsx', (_req: Request, res: Response) => {
    const buffer = jobManager.exportToExcel();
    const filename = `domain-inspector-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  });

  app.post('/api/spamhaus/test', async (req: Request, res: Response) => {
    try {
      const { username, password, proxies, useProxy } = req.body || {};
      const result = await spamhausChecker.testConnection(
        { username, password },
        proxies,
        useProxy
      );
      res.json({
        ok: result.success,
        success: result.success,
        message: result.message,
        limits: result.limits
      });
    } catch (err: any) {
      res.status(200).json({
        ok: false,
        success: false,
        message: err?.message || 'Connection test failed'
      });
    }
  });

  app.post('/api/retry-spamhaus', (_req: Request, res: Response) => {
    const state = jobManager.retrySpamhausErrors();
    res.json({ success: true, state });
  });

  app.post('/api/test-suite/run', async (_req: Request, res: Response) => {
    try {
      const suiteResults = await runFullTestSuite();
      res.json(suiteResults);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed running test suite' });
    }
  });

  // Catch-all for unknown /api/* routes returning JSON (never fallback to HTML/SPA)
  app.all('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API route not found' });
  });

  // Frontend integration: Vite middleware in development, static in production (non-/api paths only)
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Domain Inspector] Server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Domain Inspector] Failed to start server:', err);
  process.exit(1);
});
