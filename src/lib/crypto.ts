import crypto from "node:crypto";
import { ENCRYPTION_KEY } from "../config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;   // 96-bit nonce recommended size for GCM
const TAG_LENGTH = 16;  // 128-bit auth tag

if (!ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY is not set — add it to your .env");
}
const KEY = Buffer.from(ENCRYPTION_KEY, `hex`);
export const encrypt = (blob: string): string => {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

    const ciphertext = Buffer.concat([
        cipher.update(blob, "utf8"),
        cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return process.env.ENCRYPTION_KID + `.` + (Buffer.concat([iv, authTag, ciphertext]).toString("base64url"));
}

/** Decrypt a token produced by `encrypt()`. Throws if it was tampered with. */
export const decrypt = (token: string): string => {
    const data = Buffer.from(token, "base64url");

    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = data.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]).toString("utf8");
}