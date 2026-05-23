import { AsyncLocalStorage } from 'node:async_hooks';
import type { PoolClient } from 'pg';

export const transactionContext = new AsyncLocalStorage<PoolClient>();
