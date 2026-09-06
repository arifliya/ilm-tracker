import type { Hono } from "hono";
import type { AppEnv } from "../../types/env";
import { testEnv } from "./testEnv";

// Small stand-in for supertest's request(app).get(url).set(...).send(...)
// chain, built on Hono's own app.request(path, init, env) test entry point
// (a fetch-based in-process call, the same role supertest plays for
// Express). Kept deliberately close to supertest's shape so the diff on
// existing test files is mostly import-line and assertion-shape changes,
// not a rewrite of every test body.
type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

class TestRequest implements PromiseLike<{ status: number; body: any; headers: Headers }> {
  private headers: Record<string, string> = {};
  private bodyData: unknown;

  constructor(
    private app: Hono<AppEnv>,
    private method: Method,
    private path: string
  ) {}

  set(name: string, value: string): this {
    this.headers[name] = value;
    return this;
  }

  send(body: unknown): this {
    this.bodyData = body;
    return this;
  }

  private async execute() {
    const init: RequestInit = { method: this.method, headers: { ...this.headers } };
    if (this.bodyData !== undefined) {
      init.headers = { ...init.headers, "Content-Type": "application/json" };
      init.body = JSON.stringify(this.bodyData);
    }

    const res = await this.app.request(this.path, init, testEnv);
    const contentType = res.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await res.json().catch(() => undefined) : await res.text();
    return { status: res.status, body, headers: res.headers };
  }

  then<TResult1 = { status: number; body: any; headers: Headers }, TResult2 = never>(
    onfulfilled?: ((value: { status: number; body: any; headers: Headers }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export const request = (app: Hono<AppEnv>) => ({
  get: (path: string) => new TestRequest(app, "GET", path),
  post: (path: string) => new TestRequest(app, "POST", path),
  put: (path: string) => new TestRequest(app, "PUT", path),
  delete: (path: string) => new TestRequest(app, "DELETE", path),
  patch: (path: string) => new TestRequest(app, "PATCH", path)
});
