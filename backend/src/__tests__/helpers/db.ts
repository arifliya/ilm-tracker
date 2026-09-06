// Mostly superseded by config/__mocks__/db.ts's `mockDb` now that
// transactions run directly on c.get("db") instead of a separate
// pool.getConnection() connection — kept in case a route test still needs
// a standalone mock connection object for some other reason.
export const mockConnection = () => ({
  query: jest.fn(),
  release: jest.fn()
});

/** Wraps rows the way pg/@neondatabase/serverless resolves a query: `{rows, rowCount}`. */
export const rows = (data: unknown[]) => ({ rows: data, rowCount: data.length });
