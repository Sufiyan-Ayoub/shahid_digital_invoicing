import { ValueOf } from "./utils";

export const ErrorCode = {
    Unauthorized: "UNAUTHORIZED",
    InvalidCredentials: "INVALID_CREDENTIALS",
    TokenExpired: "TOKEN_EXPIRED",
    UserNotFound: "USER_NOT_FOUND",
    UserExists: "USER_EXISTS",
    InvalidInput: "INVALID_INPUT",
    RateLimited: "RATE_LIMITED",
    FileTooLarge: "FILE_TOO_LARGE",
    InvalidFileType: "INVALID_FILE_TYPE",
    ServerError: "SERVER_ERROR",
} as const;

export const OtpKind = {
    Verify: "verify",
    Reset: "reset",
} as const;

export const UserStatus = {
    InActive: 'in_active',
    Active: 'active',
    Suspended: 'suspended',
    Deleted: 'deleted',
    Banned: 'banned',
} as const;



export type ErrorCode = ValueOf<typeof ErrorCode>;
export type UserStatus = ValueOf<typeof UserStatus>;
export type OtpKind = ValueOf<typeof OtpKind>;