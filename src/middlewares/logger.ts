import type { Request, Response, NextFunction } from "express"

const c = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
    gray: '\x1b[90m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
};

const methodColor = (method: string): string => {
    switch (method) {
        case 'GET': return c.green;
        case 'POST': return c.blue;
        case 'PUT': return c.yellow;
        case 'PATCH': return c.magenta;
        case 'DELETE': return c.red;
        default: return c.cyan;
    }
};

const statusColor = (status: number): string => {
    if (status >= 500) return c.red;
    if (status >= 400) return c.yellow;
    if (status >= 300) return c.cyan;
    if (status >= 200) return c.green;
    return c.gray;
};

const timeColor = (ms: number): string => {
    if (ms >= 1000) return c.red;
    if (ms >= 300) return c.yellow;
    return c.green;
};

export const ConsoleLogger = (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();
    const timestamp = new Date().toISOString();
    const method = req.method;
    const url = req.url;
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent') || 'Unknown';

    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
        const status = res.statusCode;
        console.log(
            `${c.gray}[${timestamp}]${c.reset} ` +
            `${methodColor(method)}${c.bold}${method}${c.reset} ` +
            `${c.cyan}${url}${c.reset} ` +
            `${c.dim}- IP: ${ip} -${c.reset} ` +
            `${statusColor(status)}${c.bold}${status}${c.reset} ` +
            `${c.dim}in${c.reset} ${timeColor(durationMs)}${durationMs.toFixed(2)}ms${c.reset}`
        );
    });

    next();
};
