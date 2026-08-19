export const mockConnection = () => ({
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  query: jest.fn(),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
  release: jest.fn()
});

/** Wraps rows the way mysql2's `pool.query` resolves: `[rows, fields]`. */
export const rows = (data: unknown) => [data, []] as const;
