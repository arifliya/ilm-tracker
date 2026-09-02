import { NextFunction, Request, Response } from "express";

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
export const asyncHandler =
  <Req extends Request = Request>(fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Req, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
