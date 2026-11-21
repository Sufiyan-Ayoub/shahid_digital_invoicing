import Hashids from "hashids";
import fs from 'fs';
import path from 'path';
import busboy from 'busboy';
import sharp from 'sharp';
import type { Request, Response } from "express";
import axios from 'axios';
import useragent from 'useragent';
import { SettingsBag, UploadFile, UserAgentInfo, dynamic } from "../types"
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type';
import { v4 as uuidv4 } from 'uuid';
import { extension } from 'mime-types'
import { dynamicStrObj } from "../types/utils";
import { ErrorCode } from "../types/enums";
import crypto from "node:crypto";
import { pool, SettingsRow } from "../db";

const hashids = new Hashids(process.env.ENCRYPTION_KEY, +process.env.HASHIDS_LENGTH!)

class withGlobals<T = unknown> {

    _: T;

    constructor(value: T) {
        this._ = value
    }

    isTypeof(v: unknown) {
        return typeof this._ === typeof v
    }

    isFunction() {
        return typeof this._ === "function"
    }

    isArray() {
        return Array.isArray(this._)
    }

    isNull() {
        return this._ === null || this._ === undefined || (typeof this._ === "string" && this._.trim() === ``)
    }

    isString() {
        return typeof this._ === "string"
    }

    isNumber() {
        return /^[+-]?\d+(\.\d+)?$/.test(String(this._))
    }

    isDate() {
        const d = new Date(this._ as any)
        return !isNaN(d.getTime())
    }

    isObject() {
        return typeof this._ === "object" && !Array.isArray(this._) && this._ !== null
    }

    isEmpty() {
        if (this._ === undefined || this._ === null) return true;
        if (Array.isArray(this._)) return this._.length === 0
        if (typeof this._ === "object") return Object.keys(this._).length === 0
        return String(this._).trim().length === 0
    }

    isEmail() {
        return typeof this._ === "string" && /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(this._)
    }

    isUrl() {
        return typeof this._ === "string" && /^(https?:\/\/)?(www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/[^\s]*)?$/.test(this._)
    }

    toLowerCase() {
        (this as any)._ = typeof this._ === "string" ? this._.toLowerCase() : String(this._).toLowerCase()
        return this
    }

    equals(v: unknown) { return this._ === v }

    ucfirst() {
        if (typeof this._ === "string") (this as any)._ = this._.charAt(0).toUpperCase() + this._.slice(1)
        return this
    }

    formatString(v: string | number, ...vv: (string | number)[]) {
        const base = typeof this._ === "string" ? this._ : "";
        const values = [v, ...vv];
        (this as any)._ = base.replace(/%(\d+)/g, (_inp: string, index: string) => values[Number(index)]?.toString() || `%${index}`)
        return this
    }

    enumTokeys() {
        (this as any)._ = Object.keys(this._ as object).filter(k => isNaN(+k))
        return this
    }

    eKeyOf<E extends Record<string, string | number>>(o: E): E[keyof E] {
        if (this._ == null) throw new Error("Input is null or undefined");

        const input = String(this._).toLowerCase();

        for (const [key, val] of Object.entries(o)) {
            if (String(val).toLowerCase() === input || String(key).toLowerCase() === input) {
                return val as E[keyof E];
            }
        }

        throw new Error(`Enum value not found for input "${this._}"`);

    }

    hasValue<E extends Record<string, string | number>>(o: E): boolean {
        if (this._ == null) return false;

        const isNumeric = Object.values(o).some(v => typeof v === `number`)

        let has = false;

        if (isNumeric) {
            const keys = Object.keys(o).filter(key => isNaN(Number(key)));
            const values = keys.map(k => o[k]);
            has = values.includes(Number(this._));
        } else {
            has = (Object.values(o) as (string | number)[]).includes(this._ as string | number);
        }

        return has;
    }


    camelCase() {
        if (typeof this._ === "string") {
            (this as any)._ = this._
                .split(/[^a-zA-Z0-9]+/)
                .map((word, index) =>
                    index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
                )
                .join("")
        }
        return this
    }

    value(): T { return this._ }

    valueOf(): T { return this._ }

    toString() { return String(this._) }

    toJSON(): T { return this._ }

    [Symbol.toPrimitive](hint: string) {
        if (hint === "number") return Number(this._);
        if (hint === "boolean") return Boolean(this._);
        return String(this._);
    }

}


let cache: SettingsBag | null = null;
let fetchPromise: Promise<SettingsBag> | null = null;

export const Cog = async (refetch: boolean = false): Promise<SettingsBag> => {
    if (cache && !refetch) return cache;

    if (fetchPromise) return fetchPromise;

    fetchPromise = (async () => {
        try {
            const resp = (await pool.query<Pick<SettingsRow, 'okey' | 'ovalue'>>('SELECT okey, ovalue FROM settings')).rows;
           
            cache = resp.reduce<SettingsBag>((acc, { okey, ovalue }) => {
                if ( okey == `mail_settings` ){
                    acc[okey] = JSON.parse(ovalue);
                }else{
                    acc[okey] = ovalue;
                }
                return acc;
            }, {});


            return cache;
        } catch (err) {
            console.error('Failed to fetch settings:', err);
            throw err;
        } finally {
            fetchPromise = null;
        }
    })();

    return fetchPromise;
}

export const _ = <T>(value: T): withGlobals<T> => new withGlobals(value)

export const toHash = (str: number): string => hashids.encode(str)

export const fromHash = (str: string): number => {
    try {
        const n = hashids.decode(str)
        return n.length >= 0 ? Number(n[0]) : 0
    }
    catch (e) {
        return 0
    }
}

export const withSeperator = (...args: (string | number)[]): string => args.join(process.env.SEPERATOR)

export const withoutSeperator = (str: string): string[] => str.split(process.env.SEPERATOR!)

/** Cryptographically-random, URL-safe token (default 32 bytes → 43 chars). */
export const randomToken = (bytes: number = 32): string =>
    crypto.randomBytes(bytes).toString("base64url")

/** SHA-256 digest (base64url). Used to store a hash of a secret, never the secret itself. */
export const sha256 = (input: string): string =>
    crypto.createHash("sha256").update(input).digest("base64url")

export const pluralize = (word: string, count: number) => `${word}${count !== 1 ? 's' : ''}`


export const getIp = (req: Request): string => {
    // console.log(req.ip, req.headers['x-forwarded-for'])
    const header = req.headers['x-forwarded-for'] ?? req.ip ?? "unknown";
    return Array.isArray(header) ? header[0].trim() : header.split(`,`)[0].trim();
}


export const Geo = async (ip: string) => {
    try {
        const { data: {
            countryCode: cc,
            region,
            city,
            zip,
            lat,
            lon,
            timezone,
        } } = await axios.get(`http://ip-api.com/json/${ip}`);
        const __ = `unknown`

        return {
            cc: cc || __,
            region: region || __,
            city: city || __,
            zip: zip || __,
            lat: lat || __,
            lon: lon || __,
            timezone: timezone || __
        }
    } catch (err) { throw err; }
}

export const getUserAgent = (req: Request): UserAgentInfo => {
    const uaString: string = req.headers['user-agent'] || 'unknown';
    const agent = useragent.parse(uaString);

    return {
        browser: {
            name: agent.family || 'unknown',
            version: agent.major || 'unknown'
        },
        os: {
            name: agent.os.family || 'unknown',
            version: agent.os.major || 'unknown'
        },
        device: {
            name: agent.device.family || 'unknown'
        },
        ua: uaString
    };
}


export const getSize = (s: number): string => {
    const u: string[] = ['B', 'KB', 'MB', 'GB'];
    let x: number = 0;
    while (s >= 1024 && x < u.length - 1) {
        s /= 1024;
        x++;
    }
    return s.toFixed(2) + " " + u[x];
}

export const parseSize = (sizeString: string): number => {
    const units: string[] = ['B', 'KB', 'MB', 'GB', 'TB'];
    sizeString = sizeString.toUpperCase();
    if (sizeString == `0` || sizeString == `0 KB` || sizeString == `0KB`) return 0;

    const match = sizeString.match(/^(\d+(\.\d+)?)\s*([a-zA-Z]+)$/);
    if (!match) {
        console.log(`notmatched`, match, sizeString)
        // if (DEBUG) console.error(`Invalid size format: "${sizeString}"`);
        return 0;
    }
    const unit = match[3];
    const index = units.indexOf(unit);
    if (index === -1) {
        // if (DEBUG) console.error(`Unsupported unit: "${match[unit]}"`);
        return 0;
    }
    return +match[1] * 1024 ** index;
}


/**
 * Handles file upload process with various checks and validations.
 * @param props - The `configuration object` for the upload process
 * @param props.request - The Express request object
 * @param props.response - The Express response object
 * @param props.basePath - The `base directory path` where the file will be saved
 * @param props.max_file_size - The maximum allowed file `size in bytes || string` such as (1024 * 1024 || `1MB`) respectively 
 * @param props.allowedMimeTypes - Allowed MIME types as a string or array, matching `exactly` or via `startsWith` (e.g., `image/jpeg` or `image`).
 * @param props.onSuccess - Callback function to be called upon `successful upload`
 * @param props.name - (`optional`) The name to be used for the `uploaded file`
 * @returns void
 */
export const upload = ({ request, response, basePath, name, max_file_size: m_f_s, allowedMimeTypes, onSuccess }: UploadFile) => {
    try {
        let writeStream: any;
        const store: dynamic = {};
        const bb = busboy({ headers: request.headers });
        const max_file_size: number = typeof m_f_s == `number` ? m_f_s : parseSize(m_f_s);
        const MAGIC_CHUNK_LIMIT = 512; /// 0.5kb
        let magic_type_checked = false
        
        const abort = (_error: dynamic, file: NodeJS.ReadableStream, status?: number) => {
            request?.unpipe(bb);
            writeStream?.destroy();
            file.resume()
            if (!request.destroyed) {
                response.set("Connection", "close");
                return response.status(status || 400).json(_error);
            }

        }

        const clearFile = (path: string): void => {
            fs.promises.access(path)
                .then(async () => {
                    try {
                        await fs.promises.unlink(path);
                        // Debug.log(`BIN`, `File cleared!`);
                    } catch (_error) {
                        // Debug.error(_error);
                    }
                })
                .catch(_error => {
                    // console.log(`${UNICODES.UPLOAD} file not found!`, _error);
                })

            // if(fs.existsSync(path)){
            //     console.log(`file found`)
            //     try{
            //         fs.unlinkSync(path);
            //     }catch(_error){
            //         console.error(_error);
            //     }
            // }
        }

        const process = (file: NodeJS.ReadableStream, filename: string, post: dynamic, _allowed_types: string[]) => {
            const fn = uuidv4() + '-' + Date.now() + path.extname(filename);
            const fp = path.join(basePath, (name || fn));
            let totalSize = 0;
            let buffer = Buffer.alloc(0);

            writeStream = fs.createWriteStream(fp);
            console.log(`file name:`,filename)
            
            file.on(`data`, (chunk: Buffer) => {
                totalSize += chunk.length;
                const c = ('size' in store && store.size < totalSize);
                if ((totalSize > max_file_size) || c) {
                    abort({ message: c ? `Bad Request` : `file size exceed` }, file);
                    clearFile(fp);
                    console.log(`ERROR in clearing file file_name:${fn}`)
                    return;
                }
                
                writeStream.write(chunk);
                if (!magic_type_checked) {
                    buffer = Buffer.concat([buffer, chunk]);
                }

                if ( buffer.length  >= MAGIC_CHUNK_LIMIT && !magic_type_checked ){
                    file.pause()
                    fileTypeFromBuffer(buffer)
                        .then(type => {
                            magic_type_checked = true;
                            const ext = path.extname(filename).toLowerCase()
                            const isCsv = '.csv' == ext
                            console.log(type)
                            if ( !isCsv &&!type?.mime ){
                                console.log(`L715 MIME_TYPE_NOT_FOUND`, type)
                                // Logger.error(`[MIME_NOT_FOUND] [FILE_PATH] : ${fp}`)
                                abort({ message: `Bad Request` }, file);
                                clearFile(fp);
                                return;
                            }

                            if ( !isCsv && !_allowed_types.some(mType => type?.mime.startsWith(mType.includes(`/`) ? mType: `${mType}/`))){
                                // abort({ message: `Only ${_allowed_types.join(' ')} files are accepted.` }, file);
                                abort({ message: `Bad Request` }, file);
                                clearFile(fp);
                                return;
                            }

                            file.resume()
                        })
                        .catch(err => {
                            console.log(`@ M UPLOAD ERRORED [MIME_ISSUE]:`, err)
                            abort({ message: `Bad Request` }, file);
                            clearFile(fp);
                            return;
                        })
                }

            });

            file.on(`end`, () => {
                writeStream.end();
                onSuccess({ name: filename, tmp_name: (name || fn), path: fp, size: +store.size }, post);
            });

            file.on(`error`, (_error: Error) => {
                console.log(_error)
                abort({}, file);
                clearFile(filename);
                return;
            });

            writeStream.on(`error`, (_error: Error) => {
                abort({ message: _error.message }, file);
                clearFile(filename);
                return;
            });

            request.on(`aborted`, () => {
                abort({ message: `Upload aborted by client` }, file)
                clearFile(fp);
                return;
            });

        }

        bb.on('field', ($name, val) => {
            store[$name] = val;
        });

        bb.on(`file`, (_$name, file, info) => {
            try {
                const { filename, mimeType } = info;
                if (typeof allowedMimeTypes == `string`) allowedMimeTypes = allowedMimeTypes.split(`,`);
                if (!allowedMimeTypes.some(mType => mimeType.startsWith(mType.includes(`/`) ? mType : `${mType}/`))) return abort({ message: `Only ${allowedMimeTypes.join(' ')} files are accepted.` }, file);
                if (Object.keys(store).length < 1) return abort({ message: `Bad request` }, file);
                const { size } = store
                if (!size || isNaN(size)) return abort({ message: `Bad request` }, file);
                if (parseInt(size) > max_file_size) return abort({ message: `file size exceed` }, file);
                process(file, filename, store, allowedMimeTypes);

            } catch (_error: any) {
                // Logger.error(`[uploadErrored]`, _error)
                return abort({ message: _error.message }, file)
            }
        });

        request.pipe(bb);
    } catch (_error) {
        // Logger.error(`[uploadErrored]`, _error)
        response.json({
            error: `oauth`,
            message: `Something wrong with upload`
        })
    }
}

export const resizeImage = (p: string, w: number | null, h: number | null, q: number = 80) => {
    try {
        if (!p) throw new Error('Image path required');
        let transformer = sharp(p).webp({ quality: q });

        // Maintain aspect ratio
        if (w && h) {
            transformer = transformer.resize(w, h);
            // 'inside' ensures the image fits within w x h without stretching
        } else if (h) {
            transformer = transformer.resize({ height: h });
            // width auto, maintains aspect ratio
        } else if (w) {
            transformer = transformer.resize({ width: w });
            // height auto, maintains aspect ratio
        }
        // If neither w nor h provided, original size will be used

        return transformer;
    } catch (_error) {
        throw _error;
    }
}
export class AppError extends Error {
    scode: number;
    code: ErrorCode;

    constructor(code: ErrorCode, message: string, statusCode: number = 400) {
        super(message);
        this.code = code;
        this.scode = statusCode;
        Error.captureStackTrace(this, this.constructor);
    }
}

export const Err = (resp: Response, err: AppError | Error | any) => {
    if ( err instanceof AppError ){
        return resp.status(err.scode).json({
            code: err.code,
            message: err.message,
        })
    }

    resp.status(400).json({ code: ErrorCode.ServerError, message: "Something went wrong." })
}

export const generateOtp = (): string =>
    crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");

class ImageDownloader {
    private SUSPICIOUS_PATTERNS = [
        /\.exe$/i, /\.bat$/i, /\.cmd$/i, /\.msi$/i, /\.dll$/i,
        /\.scr$/i, /\.com$/i, /\.vbs$/i, /\.js$/i, /\.jar$/i,
        /\.apk$/i, /\.pif$/i, /\.application$/i, /\.sh$/i,
        /\.bin$/i, /\.dmg$/i, /\.pkg$/i, /\.deb$/i, /\.rpm$/i
    ]

    private ALLOWED_PROTOCOLS = [ 
        `https:` 
    ]

    constructor(
        private max_file_size: number = 15 * 1024 * 1024,
        private downs_dir: string = path.join(process.cwd(), `pub/imgs`),
        private allowed_mime_types: string | string[] = [`image/png`, `image/jpeg`, `image/jpg`, `image/webp`]
    ){
        this.initDir()
    }

    private initDir(){
        try {
            if (!fs.existsSync(this.downs_dir)) {
                fs.mkdirSync(this.downs_dir, { recursive: true, mode: 0o755 });
            }
            
            if (process.platform != 'win32') {
                fs.chmodSync(this.downs_dir, 0o755);
            }
        } catch (err: any) {
            throw new Error(`Failed to create download directory: ${err?.message || err}`);
        }
    }

    private validateURL(url: string){
        try{
            const uo = new URL(url)
            if ( ! this.ALLOWED_PROTOCOLS.includes(uo.protocol) ){
                throw new Error(`Only ${this.ALLOWED_PROTOCOLS.join(`/`)} protocols allowed`)
            }else if (this.isPrivateIP(uo.hostname)) {
                throw new Error('Access to private/internal IP addresses not allowed');
            }else if (url.length > 2048) {
                throw new Error('URL too long (max 2048 characters)');
            }else if (this.isSuspicious(url)) {
                throw new Error('URL contains suspicious patterns');
            }else if (uo.username || uo.password) {
                throw new Error('URL contains authentication credentials');
            }else if (uo.port && [21, 22, 23, 25, 53, 110, 135, 139, 143, 445, 993, 995, 1723, 3306, 3389, 5432].includes(parseInt(uo.port))) {
                throw new Error('Suspicious port in URL');
            }
        }catch(err){
            throw err;
        }
    }

    private isPrivateIP(hostname: string) : boolean {
        const privateIPPatterns = [
            /^10\./,                                      // 10.0.0.0/8
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./,            // 172.16.0.0/12
            /^192\.168\./,                               // 192.168.0.0/16
            /^127\./,                                    // 127.0.0.0/8
            /^169\.254\./,                               // Link-local
            /^::1$/,                                     // IPv6 localhost
            /^fc00:/, /^fd00:/,                          // IPv6 private
            /^fe80:/                                     // IPv6 link-local
        ]

        return privateIPPatterns.some(pattern => pattern.test(hostname));
    }

    private isSuspicious(url: string): boolean {
        return this.SUSPICIOUS_PATTERNS.some(pattern => pattern.test(url));
    }

    private isAllowedMime(mime: string): boolean {
        return this.allowed_mime_types instanceof Array
            ? this.allowed_mime_types.includes(mime)
            : this.allowed_mime_types == mime;
    }


    private async verifyMagicType(url: string){
        const type = await fileTypeFromFile(url)
            
        console.log(type)
        if ( !type?.mime || !this.isAllowedMime(type.mime) ){
            throw new Error(`File type not allowed: ${type?.mime || `unknown`}`);
        }

        return type
    }


    private async cleanupFiles(...paths: string[]) {
        for (const filePath of paths) {
            if (filePath && fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                    console.log(`Cleaned up: ${filePath}`);
                } catch (err: any) {
                    console.warn(`Could not cleanup: ${filePath}`, err.message || err);
                }
            }
        }
    }

    async start(url: string){
        let fp: string | null = null;
        try{
            this.validateURL(url)
            const { file_name, uri } = await this.download(url)
        
            const type = await this.verifyMagicType(uri)

            return {
                file_name,
                uri,
                type
            }
            
        }catch(err){
            if ( fp ){
                await this.cleanupFiles(fp)
            }
            throw err
        }
    }

    async startBatch(media: string | string[], sep:string=`,`){
        const m: string[] = typeof media == `string` ? media.split(sep) : media;
        const cache: string[] = []

        for(const n of m){
            try{
                const { file_name } = await this.start(n)
                cache.push(file_name)
            }catch(err){
                console.log(err)
            }
        }
        return cache
    }

    private async download(url: string): Promise<{
        file_name: string;
        uri: string;
        size: number;
        contentType: string;
        contentLength: number;
    }>{
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 60000)
        let fp: string | null = null;
        try{
            
            const resp = await axios({
                method: `GET`,
                url,
                responseType: `stream`,
                timeout: 50000,
                maxContentLength: this.max_file_size,
                maxRedirects: 0,
                signal: controller.signal
            })
            
            clearTimeout(timeout)

            const contentType = String(resp.headers[`content-type`] ?? resp.headers[`Content-Type`] ?? ``)

            if ( !contentType || !this.isAllowedMime(contentType)){
                throw new Error(`Invalid mime type: ${contentType || 'unknown'}`);
            }

            const fileName = uuidv4() + `.` +  extension(contentType);

            const rawContentLength = resp.headers['content-length'];
            const hasContentLength = rawContentLength != null && String(rawContentLength).trim() !== ``;
            const parsedLength = hasContentLength ? parseInt(String(rawContentLength), 10) : NaN;

            if (hasContentLength && Number.isNaN(parsedLength)) {
                throw new Error(`Invalid content-length header: ${rawContentLength}`);
            }

            // Header maujood ho to pehle hi limit check kar lo; missing ho to stream size guard (neeche) handle karega
            if (!Number.isNaN(parsedLength) && parsedLength > this.max_file_size) {
                throw new Error(`File size ${parsedLength} bytes exceeds limit ${this.max_file_size}`);
            }

            const contentLength = Number.isNaN(parsedLength) ? 0 : parsedLength;

            const contentDisposition = String(resp.headers['content-disposition'] ?? ``);
            if (contentDisposition && this.isSuspicious(contentDisposition)) {
                throw new Error('Suspicious content disposition header');
            }
            
            const filePath =path.join(this.downs_dir, fileName)
            
            return new Promise((resolve, reject) => {
                let downloadedSize = 0;
                const writer = fs.createWriteStream(filePath);
    
                resp.data.on('data', (chunk: Buffer) => {
                    downloadedSize += chunk.length;
                    if (downloadedSize > this.max_file_size) {
                        writer.destroy();
                        resp.data.destroy();
                        controller.abort();
                        reject(new Error(`File size limit exceeded: ${downloadedSize} bytes`));
                    }
                })
    
                resp.data.pipe(writer);
    
                writer.on('finish', () => {
                    resolve({
                        file_name: fileName,
                        uri: filePath,
                        size: downloadedSize,
                        contentType: contentType,
                        contentLength: contentLength
                    })
                })
    
                writer.on('error', error => {
                    controller.abort();
                    reject(new Error(`File write error: ${error.message}`));
                })
    
                resp.data.on('error', (error: any) => {
                    writer.destroy();
                    controller.abort();
                    reject(new Error(`Download stream error: ${error.message}`));
                })
            })

        }catch(err: any){
            clearTimeout(timeout)
            if ( fp ) {
                await this.cleanupFiles(fp);
            }
            if (err.name == 'AbortError') {
                throw new Error('Download timeout');
            }
            throw err;
        }
    }
    
}
export const ImgDownload = new ImageDownloader()
