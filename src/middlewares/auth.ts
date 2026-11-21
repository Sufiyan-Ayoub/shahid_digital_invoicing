import type { Request, Response, NextFunction } from "express";
import { redis, k } from "../db/redis";
import { pool } from "../db";
import { AppError, Err, decrypt, withoutSeperator } from "../lib";
import { ErrorCode, UserStatus } from "../types/enums";
import type { UsersRow, SessionsRow } from "../db/schema";
import { UserRole } from "../db/schema";

const AUTH_CACHE_TTL = 600; // 10 minutes (sliding)

const _authKey = (uid: number): string => k(`auth:u:${uid}`);
const _sField = (sid: number | string): string => `s:${sid}`;

type AuthState = {
    st: string;        // account status
    role: UserRole;
    sids: number[];    // active (non-revoked, non-expired) session ids
};

// Source of truth: account status + role + the user's currently-valid sessions.
const _loadFromDb = async (uid: number): Promise<AuthState | null> => {
    const u = await pool.query<Pick<UsersRow, "status" | "role">>(
        `SELECT status, role FROM users WHERE id = $1 LIMIT 1`,
        [uid],
    );
    const row = u.rows[0];
    if (!row) return null;

    const s = await pool.query<Pick<SessionsRow, "id">>(
        `SELECT id FROM sessions WHERE uid = $1 AND revoked_at IS NULL AND expiry > now()`,
        [uid],
    );

    return {
        st: String(row.status),
        role: row.role,
        sids: s.rows.map((r) => r.id),
    };
};

// Write the snapshot to Redis as a fresh hash (old fields cleared first).
const _cache = async (uid: number, state: AuthState): Promise<void> => {
    const key = _authKey(uid);
    const hash: Record<string, string> = { st: state.st, role: String(state.role) };
    for (const sid of state.sids) hash[_sField(sid)] = "1";

    try {
        await redis
            .multi()
            .del(key)
            .hSet(key, hash)
            .expire(key, AUTH_CACHE_TTL)
            .exec();
    } catch { /* cache write failed → caller still has DB truth */ }
};

type Resolved = { status: string; role: UserRole | null; sessionValid: boolean };

// Resolve a user's auth snapshot with a sliding TTL. Redis hit → slide + use it;
// miss → load from DB and cache it. On any Redis error we fall back to the DB
// (source of truth) so an outage never locks users out.
const _resolve = async (uid: number, sid: number): Promise<Resolved> => {
    const key = _authKey(uid);

    try {
        const data = await redis.hGetAll(key);
        if (data && data.st) {                                  // cache warm
            redis.expire(key, AUTH_CACHE_TTL).catch(() => {});  // slide (fire-and-forget)
            return {
                status: data.st,
                role: (data.role as UserRole) ?? null,
                sessionValid: data[_sField(sid)] === "1",
            };
        }
    } catch { /* redis down → fall through to DB */ }

    const fresh = await _loadFromDb(uid);
    if (!fresh) return { status: "missing", role: null, sessionValid: false };

    await _cache(uid, fresh);
    return {
        status: fresh.st,
        role: fresh.role,
        sessionValid: fresh.sids.includes(sid),
    };
};

/**
 * Revoke ONE session from the cache (call after setting its `revoked_at` in the DB).
 * Surgical: removes just this session, leaving the user's other sessions warm.
 * If the cache is cold it's a no-op — the next request reloads from the DB, which
 * already excludes the revoked session. Always update the DB FIRST, then call this.
 */
export const invalidateSession = async (uid: number | string, sid: number | string): Promise<void> => {
    try { await redis.hDel(_authKey(+uid), _sField(sid)); } catch { /* best-effort */ }
};

/**
 * Drop a user's WHOLE cached snapshot so the next request re-reads the DB.
 * Call after anything that changes the user as a whole: ban / suspend / delete /
 * re-activate, a role change, or a NEW session being created (so the new sid is
 * picked up immediately instead of after the TTL).
 */
export const invalidateUser = async (uid: number | string): Promise<void> => {
    try { await redis.del(_authKey(+uid)); } catch { /* best-effort */ }
};

// Web sends the access token in the httpOnly `__at` cookie; mobile in the
// Authorization: Bearer header.
const _extractToken = (req: Request): string | null => {
    const fromCookie = req.cookies?.__at;
    if (fromCookie) return fromCookie;

    const h = req.get("authorization");
    if (h && h.startsWith("Bearer ")) return h.slice(7).trim();

    return null;
};

export const requireAuth = async (req: Request, resp: Response, next: NextFunction): Promise<void> => {
    try {
        const token = _extractToken(req);
        if (!token) {
            throw new AppError(ErrorCode.Unauthorized, "Authentication required.", 401);
        }

        let parts: string[] = [];
        try { parts = withoutSeperator(decrypt(token)); } catch { parts = []; }

        // access token = [kind, uid, sid, role, expiryMs]
        const [kind, uidStr, sidStr, , expiryStr] = parts;

        if (kind !== "access" || !uidStr || !sidStr || !expiryStr) {
            throw new AppError(ErrorCode.Unauthorized, "Invalid access token.", 401);
        }

        // Stateless expiry check — an expired token never touches Redis/DB.
        // Frontend should hit /refresh on this 401.
        if (Date.now() >= +expiryStr) {
            throw new AppError(ErrorCode.TokenExpired, "Access token expired.", 401);
        }

        const uid = +uidStr;
        const sid = +sidStr;

        const r = await _resolve(uid, sid);

        // Account must be active (covers missing/banned/suspended/inactive).
        if (r.status !== UserStatus.Active) {
            throw new AppError(ErrorCode.Unauthorized, "This account can no longer be used.", 403);
        }

        // Session must still be valid (not revoked / logged out / expired).
        if (!r.sessionValid) {
            throw new AppError(ErrorCode.Unauthorized, "Session is no longer valid. Please sign in again.", 401);
        }

        // Fresh role from the snapshot (not the token) so a role change applies
        // immediately once the cache is invalidated.
        req.user = { uid, sid, role: r.role! };

        next();
    } catch (err) {
        Err(resp, err);
    }
};

/** Gate a route to specific roles. Must run AFTER requireAuth. */
export const requireRole = (...roles: UserRole[]) => {
    return (req: Request, resp: Response, next: NextFunction): void => {
        if (!req.user || !roles.includes(req.user.role)) {
            Err(resp, new AppError(ErrorCode.Unauthorized, "You do not have permission to do this.", 403));
            return;
        }
        next();
    };
};
