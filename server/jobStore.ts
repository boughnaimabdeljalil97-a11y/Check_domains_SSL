import pg from 'pg';
import type { InspectionState } from './types.js';

const { Pool } = pg;

export interface JobStore {
  getJob(jobId?: string): Promise<InspectionState | null>;
  saveJob(jobId: string, state: InspectionState): Promise<void>;
  listJobs(): Promise<Array<{ id: string; updatedAt: string }>>;
}

class PostgresJobStore implements JobStore {
  private pool: pg.Pool;
  private tableInitialized = false;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
    });
  }

  private async ensureTable() {
    if (this.tableInitialized) return;
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS domain_inspector_jobs (
          id VARCHAR(255) PRIMARY KEY,
          state JSONB NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);
      this.tableInitialized = true;
    } catch (err) {
      console.error('[PostgresJobStore] Failed to ensure table exists:', err);
    }
  }

  async getJob(jobId: string = 'current'): Promise<InspectionState | null> {
    await this.ensureTable();
    try {
      const res = await this.pool.query(
        'SELECT state FROM domain_inspector_jobs WHERE id = $1 LIMIT 1',
        [jobId]
      );
      if (res.rows.length === 0) return null;
      return res.rows[0].state as InspectionState;
    } catch (err) {
      console.error('[PostgresJobStore] Error in getJob:', err);
      return null;
    }
  }

  async saveJob(jobId: string = 'current', state: InspectionState): Promise<void> {
    await this.ensureTable();
    try {
      await this.pool.query(
        `INSERT INTO domain_inspector_jobs (id, state, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (id) DO UPDATE SET state = $2, updated_at = NOW()`,
        [jobId, JSON.stringify(state)]
      );
    } catch (err) {
      console.error('[PostgresJobStore] Error in saveJob:', err);
    }
  }

  async listJobs(): Promise<Array<{ id: string; updatedAt: string }>> {
    await this.ensureTable();
    try {
      const res = await this.pool.query(
        'SELECT id, updated_at FROM domain_inspector_jobs ORDER BY updated_at DESC LIMIT 50'
      );
      return res.rows.map((r: any) => ({
        id: r.id,
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString()
      }));
    } catch (err) {
      console.error('[PostgresJobStore] Error in listJobs:', err);
      return [];
    }
  }
}

class MemoryJobStore implements JobStore {
  private jobs: Map<string, { state: InspectionState; updatedAt: string }> = new Map();

  async getJob(jobId: string = 'current'): Promise<InspectionState | null> {
    const entry = this.jobs.get(jobId);
    return entry ? JSON.parse(JSON.stringify(entry.state)) : null;
  }

  async saveJob(jobId: string = 'current', state: InspectionState): Promise<void> {
    this.jobs.set(jobId, {
      state: JSON.parse(JSON.stringify(state)),
      updatedAt: new Date().toISOString()
    });
  }

  async listJobs(): Promise<Array<{ id: string; updatedAt: string }>> {
    return Array.from(this.jobs.entries()).map(([id, val]) => ({
      id,
      updatedAt: val.updatedAt
    }));
  }
}

// Global singleton instance
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

export const jobStore: JobStore = databaseUrl
  ? new PostgresJobStore(databaseUrl)
  : new MemoryJobStore();
