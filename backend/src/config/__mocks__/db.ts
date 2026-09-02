export const pool = {
  query: jest.fn(),
  execute: jest.fn(),
  getConnection: jest.fn()
};

export const getPoolStats = jest.fn(() => ({
  activeConnections: 0,
  totalConnections: 0,
  connectionLimit: 10,
  enqueuedCount: 0
}));
