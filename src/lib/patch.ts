import { createRequire } from "node:module";
import type { RouterOptions } from "express";

export const ROUTER_DEFAULTS: RouterOptions = {
    strict: true,        // /users !== /users/
    caseSensitive: true, // /Users !== /users
}

const require = createRequire(import.meta.url);
const expressExports = require("express") as { Router: (opts?: RouterOptions) => unknown };

const OriginalRouter = expressExports.Router;

const PatchedRouter = function (options?: RouterOptions) {
    return OriginalRouter({ ...ROUTER_DEFAULTS, ...options });
} as typeof OriginalRouter;

Object.assign(PatchedRouter, OriginalRouter);

expressExports.Router = PatchedRouter;