// Manual mock for jest.mock("../config/db") (or the relative-path
// equivalent from test files under __tests__/routes/). Replaces the old
// pooled `pool` export with a single mock connection standing in for
// c.get("db") — dbMiddleware here just sets it on the context and calls
// next(), so every route handler under test sees the same mock object a
// real request-scoped Neon PoolClient would have provided.
//
// Only `query`/`release` are exposed — pg-shaped clients have no
// beginTransaction()/commit()/rollback() convenience methods; a
// transaction is just three ordinary `query("BEGIN"/"COMMIT"/"ROLLBACK")`
// calls, so tests exercising a transaction mock those via
// `query.mockResolvedValueOnce(...)` like any other call rather than a
// dedicated method.
export const mockDb = {
  query: jest.fn(),
  release: jest.fn()
};

export const dbMiddleware = async (c: any, next: () => Promise<void>) => {
  c.set("db", mockDb);
  await next();
};
