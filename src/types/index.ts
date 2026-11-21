import type { Request, Response } from "express"
import type { UserRole } from "../db/schema"
import { dynamic} from "./utils"
export * from "./utils"

/** Identity attached to the request by the `requireAuth` middleware. */
export interface AuthUser {
    uid: number;
    sid: number;
    role: UserRole;
}

declare module "express" {
    interface Request {
        user?: AuthUser;
    }
}

declare module "http" {
    interface IncomingMessage {
        // user?: User | null;
        // rawUser?: Users | null;
        // sessionID?: number;
        // with?: string;
    }
}



export interface UploadFile {
    request: Request;
    response: Response;
    basePath: string;
    name?: string;
    max_file_size: number | string;
    allowedMimeTypes: string | string[];
    onSuccess: (fileDetails: {
        name: string;
        tmp_name: string;
        path: string;
        size: number;
    }, post: dynamic) => void;
}
export type UserAgentInfo = {
    browser: {
        name: string;
        version: string;
    };
    os: {
        name: string;
        version: string;
    };
    device: {
        name: string;
    };
    ua: string;
}

export interface SettingsBag {
    [key: string]: string | Record<string, string> | undefined;
    mail_settings?: Record<string, any>;
}

export type Session = {
    accessToken: string;
    refreshToken: string;
}