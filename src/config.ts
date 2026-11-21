// import { UserCookies } from "@/lib/types";
// import { CookieOptions } from "express";
// import { google } from "googleapis"
import path from "path";

export const APP_PORT: number = Number(process.env.PORT) || 3001;
export const APP_VERSION: string = `0.0.1`;
export const APP_NAME: string = process.env.APP_NAME || "App Name";
export const SEPERATOR: string = process.env.SEPERATOR || `@@`;
export const ENCRYPTION_KEY: string = process.env.ENCRYPTION_KEY || ``;
export const IS_PROD_MODE = process.env.NODE_ENV == "production";
export const ACCESS_TTL_MS: number = (Number(process.env.ACCESS_TOKEN_TTL_MIN) || 15) * 60 * 1000;           // 15 min
export const REFRESH_TTL_MS: number = (Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30) * 24 * 60 * 60 * 1000; // 30 days

export const STATIC = path.join(process.cwd(), 'pubs');
export const APP_URL: string = `http://192.168.0.104:6866`; // frontend 
export const BASE_URL: string = `http://localhost:${APP_PORT}`;

export const ALLOWED_ORIGINS: string[] = [
    APP_URL,
    `http://localhost:${APP_PORT}`
]


/** Redis config */
export const REDIS_URL = process.env.REDIS_URL;
export const REDIS_MAX_RETRIES = Number(process.env.REDIS_MAX_RETRIES || `20`);
export const REDIS_RETRY_MAX =  3000;
export const REDIS_RETRY_BASE = 100; // msec
export const REDIS_PING_INTERVAL = Number(process.env.REDIS_PING_INTERVAL_MS || 30000);
export const REDIS_KEY_PREFIX = `base`;
// ------   ----- --------

// export const API_URL: string = `${BASE_URL}/${API_KEY}`;
export const ADMIN_EMAIL: string = ``;
// export const SESS_KEYS: UserCookies = {
//     ID: `ui`,
//     Token: `ut`,
//     // Data: `ud`,
//     // Fingerprint: `fp`,
//     Session: `si`
// };
// export const SESS_PREFIX: string = `__`;
// export const SESS_DURATION: number = 15 //15 days

// export const GOOGLE_OAUTH_CLIENT: InstanceType<typeof google.auth.OAuth2> = new google.auth.OAuth2(
//     process.env.GOOGLE_OAUTH_CLIENT_ID, 
//     process.env.GOOGLE_OAUTH_CLIENT_SECRET, 
//     `${BASE_URL}/u/o2/google_oauth`
// );

// export const _COOKIE_SETTING: CookieOptions = {
//     secure: process.env.NODE_ENV === "production",
//     sameSite: "strict",
//     maxAge: (24 * 60 * 60 * 1000) * SESS_DURATION
// }
// export const SESS_COOKIE_SETTING: CookieOptions = {
//     httpOnly: false,
//     ..._COOKIE_SETTING
// }
// export const SESS_COOKIE_SETTING_HTTP: CookieOptions = {
//     httpOnly: true,
//     ..._COOKIE_SETTING
// }
// export const DEFAULT_LANG = "en"; // for english

