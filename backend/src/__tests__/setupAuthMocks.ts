// authMiddleware now calls isTokenVersionValid on every authenticated
// request, which would otherwise mean threading one more mocked pool.query
// call into the front of every existing test's carefully-ordered mock
// queue across every route test file. Auto-mocking it here once, globally,
// defaulting to "valid," means the ~150 existing tests that go through
// authMiddleware need zero changes. A test that specifically wants to
// exercise the revoked-token path can still override it per test with
// `(isTokenVersionValid as jest.Mock).mockResolvedValueOnce(false)`.
jest.mock("../utils/tokenVersion");

import { isTokenVersionValid } from "../utils/tokenVersion";

beforeEach(() => {
  (isTokenVersionValid as jest.Mock).mockResolvedValue(true);
});
