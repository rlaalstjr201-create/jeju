import type { Pool } from 'pg';
import type { TransactionManager } from '../../application/ports/TransactionManager.js';
import { transactionContext } from './transactionContext.js';

export class PostgresTransactionManager implements TransactionManager {
  constructor(private readonly pool: Pool) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await transactionContext.run(client, work);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
