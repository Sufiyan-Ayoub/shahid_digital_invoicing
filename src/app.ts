import "./lib/patch"
import "dotenv/config"
import http, { IncomingMessage } from "node:http"
import cors from "cors"
import cookieParser from "cookie-parser"
import { WebSocketServer, WebSocket } from "ws"
import bodyParser from "body-parser"
import { Buffer as BufferType } from "node:buffer"
import express from "express"
import { Socket } from "node:net"
// import { parse } from 'cookie'
import settings from "../seeder/seedSettings"
import { 
    ALLOWED_ORIGINS,
    STATIC, 
    // SESS_KEYS, SESS_PREFIX 
} from "./config"
// import { _, fromHash, handleAPI, hasCookies, toHash } from "@/lib/core"
// import { withAccessLogger } from "@/lib/logger"
// import { withRequest } from "@/lib/request"
// import { SocketEvents } from "@/lib/types"
// import { onBroadcast, onSocketConnection } from "./lib/socket"
// import { UserStatus } from "#/generated/prisma"
// import prisma from "@/prisma"
// import { youser } from "@/app/user"
import fs from "fs"
import path from "path"
import readline from "node:readline"
import v1 from "./modules/v1"
import { ConsoleLogger } from "./middlewares/logger"
// import { db } from "./prisma/db"
import { encrypt, decrypt } from "./lib/crypto"

import crypto from "node:crypto";
import { Cog, generateOtp } from "./lib/core"
import { closeRedis, connectRedis } from "./db/redis"
import { closePool } from "./db"


const app = express();

app.disable(`x-powered-by`);
app.use(cors({
    origin: ALLOWED_ORIGINS,
    allowedHeaders: ['Content-Type', 'Authorization', 'Content-Range'],
    credentials: true,
    maxAge: 3600,
    preflightContinue: !1,
    optionsSuccessStatus: 200
}));

app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(STATIC))
app.use(ConsoleLogger);

app.use(`/v1`, v1);
// console.log(`enc: ->`,crypto.randomBytes(32).toString('hex'));

const httpServer = http.createServer(app);

// export const wss = new WebSocketServer({ noServer: true });

// httpServer.on(`upgrade`, async(req: IncomingMessage, socket: Socket, head: BufferType) => {
//     try{
//         // const cookies = req.headers.cookie != undefined ? parse(req.headers.cookie!) : {}

//         // console.log(req.url)
//         // if ( req.url != `/ws` ) return socket.destroy();
        
//         // if ( hasCookies(cookies, SESS_KEYS) ){
//         //     console.log(`has`)
//         //     const uid = fromHash(cookies[SESS_PREFIX + SESS_KEYS.ID]!)
//         //     const sid = fromHash(cookies[SESS_PREFIX + SESS_KEYS.Session]!)
            
//         //     if ( uid == 0 || sid == 0 ) return socket.destroy();
            
//         //     const session = await prisma.sessions.findUnique({
//         //         where: {
//         //             ID: sid,
//         //             status: UserStatus.Active,
//         //             expiry: {
//         //                 gt: new Date()
//         //             }
//         //         },
//         //         include: {
//         //             user: true
//         //         }
//         //     })

//         //     if ( !session ) return socket.destroy();
//         //     const u = session.user;
//         //     if ( !u || u.status == UserStatus.Banned ) return socket.destroy();

//         //     req.user = youser(u);
//         //     req.rawUser = u;
//         //     req.sessionID = session.ID;

//         //     wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
//         //         wss.emit('connection', ws, req);
//         //     });
//         // }else socket.destroy();
//     }catch(err){
//         console.log(`[HttpReuestUpgradeErrored]`, err);
//         socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
//     }
// })


// console.log(`otp:`,generateOtp())
// console.log(`cog: ->`, await Cog())
// console.log(` [ \u3832 ] `,encrypt("zapp"))
// Open the Redis connection before the server accepts traffic (OTP store +
// rate limiter depend on it). Idempotent + crash-proof — see db/redis.ts.
await connectRedis()

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, async() => {
        try{
            await closeRedis()
            await closePool()
        }catch(err){
            console.error(`[ ] Failed to cloase pools`)
        }finally{
            process.exit(0)
        }
    });
}

// app.get(`/{*splat}`, (req: Request, resp: Response) => handleAPI("Get", req, resp))
// app.post(`/{*splat}`, (req: Request, resp: Response) => handleAPI("Post", req, resp))

// wss.on(`connection`, onSocketConnection)
// wss.on(SocketEvents.Broadcast, onBroadcast)
httpServer.listen(process.env.APP_PORT, () => console.log(`Watching you on port`, process.env.APP_PORT, `:)`));