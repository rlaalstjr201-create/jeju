export interface TransactionManager {
  run<T>(work: () => Promise<T>): Promise<T>;
}
