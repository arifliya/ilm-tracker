/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  resetMocks: true,
  setupFiles: ["<rootDir>/src/__tests__/setupEnv.ts"],
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/setupAuthMocks.ts"]
};
