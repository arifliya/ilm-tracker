"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpError = void 0;
// Thrown from inside a route handler to produce a specific status code +
// message via the centralized error middleware (app.ts), instead of every
// route hand-rolling its own res.status(...).json(...) for the same cases
// (duplicate keys, missing FK targets, business-rule violations, ...).
class HttpError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.name = "HttpError";
        this.statusCode = statusCode;
    }
}
exports.HttpError = HttpError;
