"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = void 0;
// Express doesn't catch a rejected promise from an async handler on its
// own — an unhandled rejection there just hangs the request instead of
// reaching the error middleware. Every existing route already has its own
// try/catch, so this isn't a retrofit; it's here so new routes don't have
// to hand-roll that boilerplate to get the same safety:
//
//   router.get("/thing", asyncHandler(async (req, res) => {
//     const thing = await mayReject();
//     res.json(thing);
//   }));
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
exports.asyncHandler = asyncHandler;
