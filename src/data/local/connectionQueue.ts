/**
 * Runs database work on one connection strictly one at a time.
 *
 * expo-sqlite's `withTransactionAsync` is not exclusive: a second call while
 * one is in flight fails its BEGIN and then runs ROLLBACK, which aborts the
 * FIRST transaction; that one then continues in autocommit and leaves partial
 * rows. `withExclusiveTransactionAsync` is not used instead: it opens a new
 * connection per transaction, where `foreign_keys` is off (it is set per
 * connection and cannot be enabled inside BEGIN).
 *
 * Every repository operation on a connection goes through this queue. A
 * failed task never blocks the tasks queued after it.
 */
const tails = new WeakMap<object, Promise<unknown>>();

export function runSerialized<T>(connection: object, task: () => Promise<T>): Promise<T> {
  const previous = tails.get(connection) ?? Promise.resolve();
  const result = previous.then(task);
  tails.set(
    connection,
    result.catch(() => undefined),
  );
  return result;
}
