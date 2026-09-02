// Thrown from inside a route handler to produce a specific status code +
// message via the centralized error middleware (app.ts), instead of every
// route hand-rolling its own res.status(...).json(...) for the same cases
// (duplicate keys, missing FK targets, business-rule violations, ...).
export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}
