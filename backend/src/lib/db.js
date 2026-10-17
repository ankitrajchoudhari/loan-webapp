// Two physically separate databases: "live" (real committee records) and "test" (practice data).
// Each request runs inside an AsyncLocalStorage context that picks one; `prisma` resolves to it.
import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient, Prisma } from '@prisma/client';

const store = new AsyncLocalStorage();
const clients = {};

function sameDatabase(a, b) {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.host === y.host && x.pathname === y.pathname;
  } catch {
    return a === b;
  }
}

export function testEnvAvailable() {
  const live = process.env.DATABASE_URL;
  const test = process.env.TEST_DATABASE_URL;
  return Boolean(test) && !sameDatabase(live, test);
}

export function client(env = 'live') {
  if (env === 'test' && !testEnvAvailable()) throw new Error('Practice database is not configured');
  if (!clients[env]) {
    const url = env === 'test' ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
    // screenshots are loaded only where asked for (omit: { screenshot: false }), never in lists
    clients[env] = new PrismaClient({ datasources: { db: { url } }, omit: { payment: { screenshot: true }, platformBill: { screenshot: true } } });
  }
  return clients[env];
}

/** Run `fn` with `prisma` bound to the given environment's database. */
export const runInEnv = (env, fn) => store.run({ env }, fn);

export const currentEnv = () => store.getStore()?.env ?? 'live';

/** Admin accounts always live in the live database. */
export const liveDb = () => client('live');

export const prisma = new Proxy(
  {},
  {
    get(_target, key) {
      const c = client(currentEnv());
      const value = c[key];
      return typeof value === 'function' ? value.bind(c) : value;
    },
  },
);

export async function disconnectAll() {
  await Promise.all(Object.values(clients).map((c) => c.$disconnect()));
}

export { Prisma };
