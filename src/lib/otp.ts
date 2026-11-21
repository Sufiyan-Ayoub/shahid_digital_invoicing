// import { redis, k } from "../db/redis";
// import type { OtpKind } from "../types/enums";

// const DEFAULT_MAX_ATTEMPTS = 5;



// export type OtpFailReason = "expired" | "invalid" | "too_many_attempts";
// export type OtpResult = { ok: true } | { ok: false; reason: OtpFailReason };


// /** Seconds remaining before a code expires (-2 = no such key, -1 = no TTL). */
// // export async function otpTtl(kind: OtpKind, uid: number | string): Promise<number> {
// //     return redis.ttl(otpKey(kind, uid));
// // }

// // /** Explicitly drop a user's OTP (e.g. on logout / resend). */
// // export async function clearOtp(kind: OtpKind, uid: number | string): Promise<void> {
// //     await redis.del(otpKey(kind, uid));
// // }
