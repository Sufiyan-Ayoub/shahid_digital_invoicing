import { createClient, type RedisClientType } from "redis";
import { REDIS_MAX_RETRIES, REDIS_URL, REDIS_RETRY_BASE, REDIS_RETRY_MAX, REDIS_PING_INTERVAL, REDIS_KEY_PREFIX } from "../config";


if ( !REDIS_URL ) new Error(`[ REDIS_URL ] is not defined!`);

const reconnectStrategy = (retries: number, cause: Error) : number | Error => {
    if (REDIS_MAX_RETRIES > 0 && retries > REDIS_MAX_RETRIES) {
        return new Error(
            `[redis] gave up reconnecting after ${REDIS_MAX_RETRIES} attempts: ${cause?.message ?? cause}`,
        );
    }

    const backoff = Math.min(REDIS_RETRY_BASE * 2 ** Math.min(retries, 20), REDIS_RETRY_MAX);
    const jitter = backoff / 2 + Math.floor(Math.random() * (backoff / 2));
    return jitter;
}

export const redis = createClient({
    url: REDIS_URL,
    socket: {
        connectTimeout: 10_000,
        keepAlive: true,
        reconnectStrategy,
    },
}) as RedisClientType;

redis.on(`error`, (err) => {
    console.error('[redis] client error:', err instanceof Error ? err.message : err);
})

redis.on(`connect`, () => console.info('[redis] connecting…'));
redis.on(`ready`, () => console.info('[redis] ready'));
redis.on(`reconnecting`, () => console.warn('[redis] reconnecting…'));
redis.on(`end`, () => console.info('[redis] connection closed'));

let connecting: Promise<void> | null = null;
export const connectRedis = async() => {
    if ( redis.isOpen ) return;
    return connecting ??= redis.connect()
        .then(() => undefined)
        .finally(() => {
            connecting = null
        })
}


let closing: Promise<void> | null = null;
export function closeRedis(): Promise<void> {
    if (closing) return closing;

    return (closing = (redis.isOpen ? redis.quit() : Promise.resolve())
        .then(() => undefined)
        .catch(() => {
            try { redis.destroy(); } catch {}
        }));
}

export const k = (key: string) => (REDIS_KEY_PREFIX ? `${REDIS_KEY_PREFIX}${key}` : key);

export const redisInfo = () => ({
    open: redis.isOpen,
    ready: redis.isReady,
    keyPrefix: REDIS_KEY_PREFIX || null
})