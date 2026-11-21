// NOTE: This middleware is intentionally NOT mounted in app.ts right now.
// Security headers are applied at the nginx edge instead (single source of
// truth for both the frontend and backend). Keep this as a reference / fallback
// — if nginx ever stops being the entry point, mount it with `app.use(securityHeaders)`.
// See docs/nginx-security-headers.md for the nginx setup.

import type { Request, Response, NextFunction } from "express";

export const securityHeaders = (_req: Request, resp: Response, next: NextFunction): void => {
    resp.setHeader("X-Content-Type-Options", "nosniff");
    resp.setHeader("X-Frame-Options", "DENY");
    resp.setHeader("Referrer-Policy", "no-referrer");

    resp.setHeader("X-XSS-Protection", "0");

    resp.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    resp.setHeader("Cross-Origin-Resource-Policy", "same-origin");

    resp.setHeader("Origin-Agent-Cluster", "?1");

    resp.setHeader(
        "Permissions-Policy",
        // geolocation=(), 
        "camera=(), microphone=(), payment=(), usb=(), interest-cohort=()"
    );

    const csp = [
        "default-src 'self'",
        "script-src 'self'",        // inline & injected <script> blocked
        "script-src-attr 'none'",   // inline event handlers (onclick=) blocked
        "object-src 'none'",        // <object>/<embed> disabled (old plugin holes)
        "base-uri 'self'",          // stop <base> tag hijacking
        "frame-ancestors 'self'",   // modern equivalent of X-Frame-Options
        "form-action 'self'",       // forms may only submit back to our own site
    ];

    if (process.env.NODE_ENV == "production") {
        resp.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
        csp.push("upgrade-insecure-requests");
    }
    
    resp.setHeader("Content-Security-Policy", csp.join("; "));

    next();
}
