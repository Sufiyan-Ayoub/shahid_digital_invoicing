import type { Request, Response } from "express";
import {
    _, Cog, generateOtp, 
    AppError, Err, 
    withSeperator, withoutSeperator,
    getIp, getUserAgent, Geo, 
    randomToken, sha256, decrypt, encrypt,
    LANG, sendEmail, composeEmail
} from "../../../lib";
import { ErrorCode, OtpKind, UserStatus } from "../../../types/enums";
import { pool } from "../../../db";
import { UserRole } from "../../../db/schema";
import { APP_URL, REFRESH_TTL_MS, ACCESS_TTL_MS, IS_PROD_MODE } from "../../../config";
import { k, redis } from "../../../db/redis";
import type { UsersRow, SessionsRow } from "../../../db/schema";
import type { Session } from "../../../types";

const _otpKey = (kind: OtpKind, uid: number | string): string => k(`otp:${kind}:${uid}`);
const _signAccessToken = (uid: number, sid: number, role: UserRole): string => encrypt(withSeperator(`access`, uid, sid, role, Date.now() + ACCESS_TTL_MS));
const _signRefreshToken = (uid: number, sid: number, secret: string): string => encrypt(withSeperator(`refresh`, uid, sid, secret));

const _storeOtp = async(
    kind: OtpKind,
    uid: number | string,
    code: string,
    ttlSeconds: number,
): Promise<void> => {
    const key = _otpKey(kind, uid);
    await redis
        .multi()
        .hSet(key, { code, attempts: 0 })
        .expire(key, ttlSeconds)
        .exec();
}

const _sendVerificationToken = async(mail_settings: Record<string, unknown>, user: Pick<UsersRow, "id" | "nm" | "em">, action: string) => {
    try{
        const { mode } = mail_settings

        const ttlSeconds = Math.floor(+mail_settings.mail_expiry_in_hours! * 60 * 60);

        const otp = generateOtp();

        await _storeOtp(OtpKind.Verify, user.id, otp, ttlSeconds);

        const verifyToken = encrypt(withSeperator(OtpKind.Verify, action, mode + ``, user.id, mode ? otp : ``))

        sendEmail({
            to: user.em!,
            subject: LANG.emailVerificationSubject,
            html: composeEmail(
                LANG[ mode ? `emailVerificationEmailLink`: `emailVerificationEmailOtp` ],
                user.nm!,
                mode ? `${APP_URL}u/verify/${verifyToken}`: otp
            )
        })

        if ( !mode ) return verifyToken;
    }catch(err){
        throw err;
    }
}

const _makeSession = async (
    req: Request,
    resp: Response,
    user: Pick<UsersRow, "id" | "role">,
) => {
    const ip = getIp(req);
    const ua = getUserAgent(req);

    let geo: unknown = null;
    try { 
        geo = await Geo(ip); 
    }catch {}

    const secret = randomToken(); // raw refresh secret
    const tokenHash = sha256(secret);
    const expiry = new Date(Date.now() + REFRESH_TTL_MS);

    const created = await pool.query<Pick<SessionsRow, "id">>(
        `INSERT INTO sessions (uid, token, user_agent, geo, einfo, expiry)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
            user.id,
            tokenHash,
            JSON.stringify(ua),
            JSON.stringify(geo ?? {}),
            ip,
            expiry,
        ],
    );

    const sid = created.rows[0]!.id;

    const accessToken = _signAccessToken(user.id, sid, user.role);
    const refreshToken = _signRefreshToken(user.id, sid, secret);

    if ( req.get("X-Client-Type") == "mob" ) {
        return { 
            accessToken, 
            refreshToken 
        }
    }
    
    resp.cookie("__at", accessToken, {
        httpOnly: true,
        secure: IS_PROD_MODE,
        sameSite: "strict",
        maxAge: ACCESS_TTL_MS,
        path: "/",
    });

    resp.cookie("__rt", refreshToken, {
        httpOnly: true,
        secure: IS_PROD_MODE,
        sameSite: "strict",
        maxAge: REFRESH_TTL_MS,
        path: "/v1/auth",
    });

    return {};
}

const _verifyOtp = async(
    kind: OtpKind,
    uid: number | string,
    code: string,
    maxAttempts: number = 5,
) => {
    const key = _otpKey(kind, uid);
    const data = await redis.hGetAll(key);
    
    if (!data || !data.code) {
        throw new AppError(
            ErrorCode.TokenExpired,
            `This code has expired. Please request a new one.`
        )
    }

    if (Number(data.attempts ?? 0) >= maxAttempts) {
        await redis.del(key);

        throw new AppError(
            ErrorCode.RateLimited,
            `Too many wrong attempts. Please request a new code.`,
            429
        )
    }

    if (data.code != String(code)) {
        await redis.hIncrBy(key, "attempts", 1);
        throw new AppError(
            ErrorCode.InvalidInput,
            `OTP is invalid!`
        )
    }

    await redis.del(key);
}

export const Signup = async (req: Request, resp: Response) => {
    try {
        const { nm, em, psw } = req.body ?? {};
        const e = em?.trim().toLowerCase();
        const p = psw?.trim();

        if ( !e || !_(e).isEmail() ){
            throw new AppError(
                ErrorCode.InvalidInput,
                "Email address is invalid or undefined"
            )
        }

        if ( !p ) {
            throw new AppError(
                ErrorCode.InvalidInput,
                "Password is required!"
            )
        }

        const has = await pool.query<Pick<UsersRow, "id" | "nm" | "em" | "psw">>(
            `SELECT 1 FROM users WHERE em = $1 AND status != $2 LIMIT 1`,
            [e, UserStatus.Deleted],
        );
        

        if ( has.rows.length ){
            throw new AppError(
                ErrorCode.UserExists,
                "An account with this email already exists",
                409
            )
        }

        const n = nm?.trim() || e.split(`@`)[0];

        const user = (await pool.query<Pick<UsersRow, "id" | "role">>(
            `INSERT INTO users (nm, em, psw) VALUES ($1, $2, $3) RETURNING id, role`,
            [n, e, encrypt(p)],
        ))?.rows[0];


        let token: string | undefined;
        let session: Partial<Session> | undefined;

        const { mail_settings } = await Cog()
        const { mail_verification, mode } = mail_settings!

        if ( mail_verification ){
            token = await _sendVerificationToken(
                mail_settings!,
                { id: user.id, em: e, nm: n },
                `signup`
            )
        } else {
            session = await _makeSession(req, resp, { id: user.id, role: user.role })
        }

        resp.status(201).json({
            message: "Goog job! Your account has been created.",
            ...(mail_verification && {_next: mode ? `/u/verify` : `/u/welcome`}),
            token,
            ...session,
        });
    } catch (err) {
        Err(resp, err)
    }
}

export const Signin = async (req: Request, resp: Response) => {
    try {
        const { em, psw } = req.body ?? {};
        const e = em?.trim().toLowerCase();
        const p = psw?.trim();

        if ( !e || !_(e).isEmail() ){
            throw new AppError(
                ErrorCode.InvalidInput,
                "Email address is invalid or undefined"
            )
        }

        if ( !p ){
            throw new AppError(
                ErrorCode.InvalidInput, 
                "Password is required!"
            )
        }


        const user = (await pool.query<Pick<UsersRow, "id" | "nm" | "role" | "status" | "psw">>(
            `SELECT id, nm, role, status, psw FROM users WHERE em = $1 AND status != $2 LIMIT 1`,
            [e, UserStatus.Deleted],
        ))?.rows[0];

        if ( !user ){
            throw new AppError(
                ErrorCode.InvalidCredentials,
                "Email or password is incorrect",
                401
            )
        }

        if ( decrypt(user.psw!) != p ){
            throw new AppError(
                ErrorCode.InvalidCredentials,
                "Email or password is incorrect",
                401
            )
        }

        switch(user.status.toString()){
            case UserStatus.Banned:
                throw new AppError(
                    ErrorCode.Unauthorized, 
                    "This account has been banned.", 403
                );
            case UserStatus.Suspended:
                throw new AppError(
                    ErrorCode.Unauthorized, 
                    "This account is suspended.",
                    403
                );
            case UserStatus.InActive:
                throw new AppError(
                    ErrorCode.Unauthorized, 
                    "Please verify your account before signing in.", 
                    403
                );
        }

        let token: string | undefined;
        let session: Partial<Session> | undefined;

        const { mail_settings } = await Cog()
        const { mail_verification, one_time_email_verification, mode } = mail_settings!
        const needVerify = !one_time_email_verification && mail_verification;

        if ( needVerify ){
            token = await _sendVerificationToken(
                mail_settings!,
                { id: user.id, em: e, nm: user.nm },
                `signin`
            )
        } else {
            session = await _makeSession(req, resp, { id: user.id, role: user.role })
        }

        

        resp.status(200).json({
            message: "Welcome back!",
            ...(needVerify && {_next: mode ? `/u/verify` : `/u/welcome`}),
            ...session,
        });
    } catch (err) {
        Err(resp, err)
    }
}

export const Verify = async (req: Request, resp: Response) => {
    try{
        const { token, otp } = req.body
        
        if ( _(token).isEmpty() ) {
            throw new AppError(
                ErrorCode.InvalidInput,
                "Token is required!"
            )
        }

        const [kind, action, mode, uid, embedded] = withoutSeperator(decrypt(token))

        if ( !kind || !action || !mode || !uid ){
            throw new AppError(
                ErrorCode.InvalidInput,
                "Token is invalid!"
            )
        }

        if ( kind == OtpKind.Verify ){
            const code = mode == `1` ? embedded : otp

            if ( !code ){
                throw new AppError(
                    ErrorCode.InvalidInput,
                    mode == `1` ? "Token is invalid!" : "OTP is required!"
                )
            }

            await _verifyOtp(OtpKind.Verify, +uid, code)

            const activated = await pool.query<Pick<UsersRow, "id" | "role">>(
                `UPDATE users SET status = $1 WHERE id = $2 AND status NOT IN ($3, $4) RETURNING id, role`,
                [UserStatus.Active, +uid, UserStatus.Deleted, UserStatus.Banned],
            )

            const u = activated.rows[0]
            if ( !u ){
                throw new AppError(
                    ErrorCode.InvalidInput,
                    "This account cannot be verified.",
                )
            }

            const session = await _makeSession(req, resp, { id: u.id, role: u.role })

            return resp.status(200).json({
                message: "Your account has been verified.",
                ...session,
            })
        }

        throw new AppError(
            ErrorCode.InvalidInput,
            "Unsupported verification kind."
        )
    }catch(err){
        Err(resp, err)
    }
}

export const Refresh = async (req: Request, resp: Response) => {
    try {
        const raw = req.cookies?.rt || req.body?.refreshToken;

        if ( !raw ){
            throw new AppError(
                ErrorCode.Unauthorized, 
                "Refresh token is missing.", 
                401
            )
        }

        let parts: string[] = [];
        try { parts = withoutSeperator(decrypt(raw)); } catch { parts = []; }

        const [kind, uidStr, sidStr, secret] = parts;

        if ( kind != `refresh` || !uidStr || !sidStr || !secret ){
            throw new AppError(ErrorCode.Unauthorized, "Refresh token is invalid.", 401)
        }

        const uid = +uidStr;
        const sid = +sidStr;

        try {
            const rlKey = k(`rl:refresh:sid:${sid}`);
            const hits = await redis.incr(rlKey);
            if ( hits == 1 ) await redis.expire(rlKey, 600);
            if ( hits > 1 ){
                const ttl = await redis.ttl(rlKey);
                resp.setHeader("Retry-After", String(ttl > 0 ? ttl : 600));
                throw new AppError(
                    ErrorCode.RateLimited,
                    "Too many refresh requests. Please try again later.",
                    429
                )
            }
        } catch (err) {
            throw err;
        }

        const found = await pool.query<Pick<SessionsRow, "id" | "uid" | "token" | "revoked_at" | "expiry">>(
            `SELECT id, uid, token, revoked_at, expiry FROM sessions WHERE id = $1 AND uid = $2 LIMIT 1`,
            [sid, uid],
        );

        const sess = found.rows[0];

        if (
            !sess ||
            sess.revoked_at ||
            sess.token != sha256(secret) ||
            new Date(sess.expiry).getTime() <= Date.now()
        ){
            throw new AppError(
                ErrorCode.Unauthorized,
                "Session is invalid or expired. Please sign in again.",
                401
            )
        }

        const u = await pool.query<Pick<UsersRow, "id" | "role" | "status">>(
            `SELECT id, role, status FROM users WHERE id = $1 LIMIT 1`,
            [uid],
        );

        const user = u.rows[0];

        if ( !user || String(user.status) != UserStatus.Active ){
            throw new AppError(
                ErrorCode.Unauthorized, 
                "This account can no longer sign in.", 
                403
            )
        }

        const accessToken = _signAccessToken(user.id, sid, user.role);

        resp.status(200).json({
            accessToken
        });
    } catch (err) {
        Err(resp, err)
    }
}