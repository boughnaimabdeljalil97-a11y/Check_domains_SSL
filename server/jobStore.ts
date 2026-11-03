import { createClient } from '@vercel/kv';
import type { DomainItem, InspectionState, InspectionStats, CheckerSettings } from './types.js';

export const STATE_KEY = 'inspection:current';

export const DEFAULT_SETTINGS: CheckerSettings = {
  workers: 4,
  timeoutSeconds: 30,
  maxRetries: 2,
  enableSSL: true,
  enableWebsite: true,
  enableWhois: true,
  whoisPacedDelayMs: 800
};

export const DEFAULT_STATE: InspectionState = {
  status: 'idle',
  items: [],
  settings: DEFAULT_SETTINGS,
  stats: {
    total: 0,
    completed: 0,
    pending: 0,
    inFlight: 0,
    retryRequired: 0,
    sslYes: 0,
    sslNo: 0,
    websiteYes: 0,
    websiteNo: 0,
    bothYes: 0,
    whoisFound: 0,
    percentComplete: 0
  },
  activeWorkers: 0,
  currentWorkerAssignments: {},
  startedAt: null,
  updatedAt: new Date().toISOString(),
  needsContinue: false
};

export function calculateStats(items: DomainItem[]): InspectionStats {
  let completed = 0;
  let pending = 0;
  let inFlight = 0;
  let retryRequired = 0;
  let sslYes = 0;
  let sslNo = 0;
  let websiteYes = 0;
  let websiteNo = 0;
  let bothYes = 0;
  let whoisFound = 0;

  for (const item of items) {
    if (item.status === 'completed') completed++;
    else if (item.status === 'pending') pending++;
    else if (item.status === 'checking') inFlight++;
    else if (item.status === 'retry_required') retryRequired++;

    if (item.ssl.status === 'YES') sslYes++;
    else if (item.ssl.status === 'NO') sslNo++;

    if (item.website.status === 'YES') websiteYes++;
    else if (item.website.status === 'NO') websiteNo++;

    if (item.ssl.status === 'YES' && item.website.status === 'YES') {
      bothYes++;
    }

    if (item.whois.status === 'FOUND') {
      whoisFound++;
    }
  }

  const total = items.length;
  const percentComplete = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    total,
    completed,
    pending,
    inFlight,
    retryRequired,
    sslYes,
    sslNo,
    websiteYes,
    websiteNo,
    bothYes,
    whoisFound,
    percentComplete
  };
}

// Global fallback for in-memory execution during local development
declare global {
  // eslint-disable-next-line no-var
  var __DOMAIN_INSPECTION_MEMORY_STATE__: InspectionState | undefined;
}

const kvUrl = process.env.KV_REST_API_URL;
const kvToken = process.env.KV_REST_API_TOKEN;

const kvClient = kvUrl && kvToken ? createClient({ url: kvUrl, token: kvToken }) : null;

if (!globalThis.__DOMAIN_INSPECTION_MEMORY_STATE__) {
  globalThis.__DOMAIN_INSPECTION_MEMORY_STATE__ = JSON.parse(JSON.stringify(DEFAULT_STATE));
}

export async function getState(): Promise<InspectionState> {
  if (kvClient) {
    try {
      const data = await kvClient.get<InspectionState>(STATE_KEY);
      if (data && typeof data === 'object') {
        return data;
      }
    } catch (err) {
      console.error('[jobStore] Error reading from Vercel KV, falling back to memory:', err);
    }
  }

  return JSON.parse(JSON.stringify(globalThis.__DOMAIN_INSPECTION_MEMORY_STATE__ || DEFAULT_STATE));
}

export async function setState(state: InspectionState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  state.stats = calculateStats(state.items);

  // Always update in-memory cache
  globalThis.__DOMAIN_INSPECTION_MEMORY_STATE__ = JSON.parse(JSON.stringify(state));

  if (kvClient) {
    try {
      await kvClient.set(STATE_KEY, state);
    } catch (err) {
      console.error('[jobStore] Error writing to Vercel KV:', err);
    }
  }
}

export async function getItem(id: string): Promise<DomainItem | undefined> {
  const state = await getState();
  return state.items.find((it) => it.id === id);
}

let updateQueue: Promise<void> = Promise.resolve();

export async function setItem(item: DomainItem): Promise<void> {
  const op = async () => {
    const state = await getState();
    const idx = state.items.findIndex((it) => it.id === item.id);
    if (idx !== -1) {
      state.items[idx] = item;
    } else {
      state.items.push(item);
    }
    await setState(state);
  };

  updateQueue = updateQueue.then(op, op);
  return updateQueue;
}

export async function listItems(): Promise<DomainItem[]> {
  const state = await getState();
  return [...state.items].sort((a, b) => a.originalIndex - b.originalIndex);
}

export async function clearAll(): Promise<void> {
  const fresh = JSON.parse(JSON.stringify(DEFAULT_STATE));
  await setState(fresh);
}

// Interface for backward-compatibility with existing jobStore callers
export const jobStore = {
  getState,
  setState,
  getItem,
  setItem,
  listItems,
  clearAll,
  calculateStats,
  getJob: async (_jobId?: string) => getState(),
  saveJob: async (_jobId: string, state: InspectionState) => setState(state),
  listJobs: async () => [{ id: 'current', updatedAt: (await getState()).updatedAt }]
};

export default jobStore;
