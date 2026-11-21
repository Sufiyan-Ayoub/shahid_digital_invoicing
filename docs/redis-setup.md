# Redis — Zero se Seekho + Is Project ka Setup (Roman Urdu)

Ye guide do kaam karti hai:
1. **Redis kya hai, kaise kaam karta hai** — bilkul basics se (agar aapko Redis nahi aata to yahin se shuru karo).
2. **Humne is project me kya setup kiya** (`src/db/redis.ts`) — line by line samajh.

Aaram se upar se neeche padho. Har section pichhle pe build karta hai.

---

## PART 1 — Redis Basics (agar Redis bilkul nahi aata)

### 1.1 Redis hai kya?

Redis ek **in-memory database** hai. Matlab data **RAM** me rakhta hai, disk pe nahi
(isliye bohot fast — microseconds me jawab).

Ise samajhne ka aasan tareeqa: soch lo ek **bohot bada JavaScript object** hai jo
aapki app ke bahar, ek alag server pe chal raha hai:

```js
// Redis ko aise imagine karo:
const redis = {
  "otp:42": "839201",
  "session:abc": "{ userId: 42 }",
  "ratelimit:1.2.3.4": "5",
}
```

- Har cheez ek **key → value** pair hai (jaise object ki property).
- Value string, number, list, set, hash — kuch bhi ho sakti hai.
- Sabse bada superpower: **har key pe expiry (TTL) laga sakte ho** — "ye key 5 minute
  baad khud delete ho jaye". Ye OTP jaise kaam ke liye perfect hai.

### 1.2 Postgres se farq kya hai? (aur dono kyun?)

| | **Postgres** (aapke paas already hai) | **Redis** (ab add kiya) |
|---|---|---|
| Data kahan | Disk pe (permanent) | RAM me (fast, temporary) |
| Speed | Fast | Bohot zyada fast |
| Kaam | Permanent data — users, orders | Temporary/fast data — OTP, cache, sessions, rate-limit |
| Expiry | Manually column + cleanup | Built-in TTL — apne aap delete |

**Dono use hote hain saath me.** Permanent cheezein Postgres me, fast/temporary
cheezein Redis me. Jaise OTP — usse permanently rakhne ki zaroorat nahi, 5 min baad
bekaar. Redis me daalo, TTL lagao, khud delete ho jayega.

### 1.3 Redis ke basic commands (ye zaroor yaad rakho)

Redis se aap **commands** se baat karte ho. Ginti ke commands hi 90% kaam me aate hain:

```bash
SET   otp:42  839201            # key set karo
GET   otp:42                    # key ki value lo   -> "839201"
DEL   otp:42                    # key delete karo

SETEX otp:42  300  839201       # set karo + 300 sec (5 min) baad auto-delete  ← OTP ke liye
TTL   otp:42                    # kitne second bache hain?  -> 287
EXPIRE otp:42 300               # existing key pe expiry laga do

INCR  attempts:42               # number ko +1 karo (atomic) -> 1, 2, 3...  ← attempts count ke liye
```

Yaad rakhne wale 2 sabse important:
- **`SETEX key seconds value`** → value rakho + khud expire. (OTP store)
- **`INCR key`** → counter +1, **atomic** (do request ek saath aayein to bhi count sahi
  rehta hai). (attempts / rate-limit)

### 1.4 Node.js me Redis kaise use hota hai

`redis` package (jo humne install kiya) in commands ko **functions** bana deta hai:

```js
await redis.set("otp:42", "839201")
const otp = await redis.get("otp:42")        // "839201"
await redis.setEx("otp:42", 300, "839201")   // SETEX
await redis.incr("attempts:42")              // INCR
await redis.del("otp:42")
```

Bas itna hi core hai. Baaki sab isi ke around hai.

---

## PART 2 — Is Project me humne kya kiya

### 2.1 Package install

Humne official **`redis`** (node-redis) package install kiya — **pnpm** se
(npm baar-baar internal bug se fail ho raha tha):

```bash
pnpm add redis
```

> ⚠️ **Zaroori:** Ab is project me **pnpm** use ho raha hai. Aage bhi packages
> `pnpm add <name>` se hi install karo, `npm install` se nahi (warna node_modules
> ka layout tootega).

### 2.2 `ioredis` vs `redis` — humne kya kiya aur kyun

Redis ke Node me 2 mashhoor packages hain:
- **ioredis** — features zyada (auto-reconnect, retry waghera built-in), lekin humne
  ise nahi liya.
- **redis (official)** — aapne isko chuna. Ye thoda "lean" hai — kuch conveniences
  khud add karni padti hain.

Aapki request thi: **official package use karo, lekin ioredis ke achhe features
khud manually bana do.** Wahi humne `src/db/redis.ts` me kiya. Neeche wo "achhe
features" explain hain.

---

## PART 3 — `src/db/redis.ts` — Poora file samajh

Ye file bilkul `src/db/index.ts` (aapka Postgres pool) wale **same pattern** me hai:
env se configure hoti hai, crash-proof hai, clean shutdown karti hai.

### 3.1 Env helpers — `int()` aur `flag()`

```ts
const int = (v, fallback) => ...   // env string ko number banao, galat ho to fallback
const flag = (v, fallback) => ...  // env string ko true/false banao
```

**Kyun:** Saari settings `.env` se aati hain. Agar koi value missing/galat ho to app
crash na ho — safe default le le. (Ye same helpers `db/index.ts` me bhi hain —
consistency.)

### 3.2 Config constants

Sab kuch environment se control hota hai. Sirf zaroori ye hain:

| Env var | Default | Kaam |
|---|---|---|
| `REDIS_URL` | — | Poora connection string: `redis://localhost:6379`. Ye do to sabse aasan. |
| `REDIS_HOST` / `REDIS_PORT` | `127.0.0.1` / `6379` | URL na ho to inse connect. |
| `REDIS_PASSWORD` | — | Agar Redis pe password ho. |
| `REDIS_KEY_PREFIX` | `""` | Har key ke aage prefix (e.g. `app:`). |
| `REDIS_MAX_RETRIES` | `20` | Kitni baar reconnect try kare. |
| `REDIS_ENABLED` | `true` | `false` = Redis poora band. |

Local dev me aap sirf itna `.env` me daalo:
```
REDIS_URL=redis://localhost:6379
```

### 3.3 `reconnectStrategy` — (ioredis ka feature, manually banaya) ⭐

**Problem:** Redis connection kabhi bhi toot sakta hai (network, restart). Agar app
turant, baar-baar reconnect kare to Redis pe bojh (hammering) padta hai.

**Solution jo humne likha:**
- **Exponential backoff:** har fail pe wait time double — `100ms → 200ms → 400ms...`
  ek max (3 sec) tak. Dheere-dheere try karta hai, hammer nahi karta.
- **Jitter (thoda random):** agar 10 servers ek saath restart hon to sab ek hi waqt
  reconnect na karein (warna sab ek saath Redis ko dabaa dein — "thundering herd").
- **Give up:** `MAX_RETRIES` ke baad ruk jao.

Ye behavior ioredis by default deta hai — humne khud likha kyunki aapko official
package chahiye tha.

### 3.4 `buildClient()` — client banana

`createClient()` do tareeqe se: ya to `REDIS_URL` se, ya `host/port/password` se.
**Kyun:** flexibility — prod me aksar ek URL hota hai, local dev me alag fields.

### 3.5 `redis.on('error', ...)` — CRASH-PROOF ⭐ (sabse important)

```ts
redis.on('error', (err) => { console.error('[redis] client error:', ...) })
```

**Kyun ye sabse zaroori hai:** Agar Redis connection fail ho aur aap error ko handle
na karo, to **poora Node process crash** ho jata hai. Ye handler us crash ko rokta
hai — bilkul wahi guarantee jo aapke Postgres pool me `pool.on('error', ...)` deti
hai. Baaki events (`connect`, `ready`, `reconnecting`, `end`) sirf logs ke liye hain
taake pata chale connection ka haal kya hai.

### 3.6 `connectRedis()` — connection start karna ⭐

```ts
await connectRedis()   // app start hone pe ek baar call karni hai
```

**Kyun zaroori:** Postgres pool khud pehli query pe connect ho jata hai. Lekin
node-redis me aisa nahi — **explicit `.connect()`** call karni padti hai. Ye function
wahi karta hai. Ye **idempotent** hai — galti se do baar call ho jaye to bhi problem
nahi (same connection use karega).

> 👉 Ye abhi kahin call nahi hui. Next step me `app.ts` me `await connectRedis()`
> add karni hogi (Part 4 dekho).

### 3.7 Keepalive pinger

Har 30 sec me ek `PING` bhejta hai agar connection idle ho.
**Kyun:** kuch network/firewall idle connection ko chup-chaap kaat dete hain. Regular
ping se connection zinda rehta hai. (`unref()` isliye taake sirf ye timer app ko band
hone se na roke.)

### 3.8 `k(key)` — key prefix helper

```ts
k("otp:42")   // agar prefix "app:" hai to -> "app:otp:42"
```

**Kyun:** ek hi Redis ko kai apps share karein to keys aapas me na takraayein.

### 3.9 `closeRedis()` — clean shutdown

Ctrl-C / container stop (`SIGINT`/`SIGTERM`) pe connection saaf band karta hai —
pending commands complete karke. Bilkul aapke Postgres pool jaisa.

### 3.10 `redisInfo()` — status snapshot

Chhota function jo batata hai connection open/ready hai ya nahi. Health-check aur
logs ke liye (jaise `poolInfo()`).

---

## PART 4 — Ise chalana aur aage kya (Practical)

### 4.1 Apne machine pe Redis chalao

Redis server aapke computer pe hona chahiye. Mac pe (Homebrew se):

```bash
brew install redis          # ek baar
brew services start redis    # background me chalu

redis-cli ping               # test -> "PONG" aaye to chal raha hai
```

Ya Docker se:
```bash
docker run -d --name redis -p 6379:6379 redis
```

### 4.2 `.env` me add karo

```
REDIS_URL=redis://localhost:6379
```

### 4.3 App startup pe connect (✅ HO GAYA)

`src/app.ts` me ye add kiya — server traffic lene se pehle Redis connect ho jata hai:
```ts
import { connectRedis } from "./db/redis"
...
await connectRedis()   // httpServer.listen() se pehle
```

### 4.4 Khud try karke seekho (redis-cli)

Terminal me `redis-cli` chalao aur ye try karo — Part 1 ke commands live dekho:
```bash
redis-cli
> SETEX otp:42 300 839201     # OTP set, 5 min TTL
> GET otp:42                  # "839201"
> TTL otp:42                  # 297 (bachte seconds)
> INCR attempts:42            # 1
> INCR attempts:42            # 2
> DEL otp:42                  # 1 (delete ho gaya)
```

---

## PART 5 — OTP flow ab Redis pe kaise chalta hai (naya)

Ye samajhna zaroori hai — humne OTP ko Postgres `otps` table se **Redis** pe shift
kiya. Files: `src/lib/otp.ts` (store), `contorller.ts` (use).

### 5.1 `src/lib/otp.ts` — 2 main functions

```ts
storeOtp(kind, uid, code, ttlSeconds)   // code Redis me daalo + TTL (auto-expire)
verifyOtp(kind, uid, code)              // check karo -> { ok } ya { ok:false, reason }
```

- **Storage:** ek Redis hash `otp:<kind>:<uid>` (e.g. `otp:verify:42`) me do field:
  `code` aur `attempts`. Poore key pe TTL — waqt guzarte hi khud delete.
- **`verifyOtp` ki logic:**
  - key gayab/expire → `{ ok:false, reason:"expired" }`
  - 5 se zyada galat try → `{ ok:false, reason:"too_many_attempts" }` (key burn)
  - galat code → `attempts` ko `INCR` (atomic) → `{ ok:false, reason:"invalid" }`
  - sahi code → key `DEL` (one-time use) → `{ ok:true }`

Yahi wo `SETEX` + `INCR` pattern hai jo Part 1 me seekha — bas hash ke saath
(`hSet` + `expire` + `hIncrBy`).

### 5.2 Signup pe kya hota hai (`_sendVerificationToken`)

1. `otp = generateOtp()` — 6-digit code.
2. `storeOtp(verify, uid, otp, ttl)` — Redis me daal diya, TTL ke saath.
3. Ek encrypted **token** banaya jo user + purpose identify karta hai.
   - **OTP mode (0):** code token me NAHI (user email me dekhega aur type karega).
   - **Link mode (1):** code token ke andar embed (link click hi proof hai).
4. Email bheja (OTP ya link).

### 5.3 Verify pe kya hota hai (`Verify`)

1. Token decrypt → `[kind, mode, uid, embedded]`.
2. Code kahan se: link mode → token se (`embedded`), OTP mode → user ke input se.
3. `verifyOtp(verify, uid, code)` — Redis check karta hai (code + attempts + TTL).
4. Fail → sahi error (invalid / expired / too many attempts).
5. Pass → `UPDATE users SET status='active'` + success response.

> **Purana broken code fix ho gaya:** pehle `Verify` me `db.Otps.where(...)` tha jo
> exist hi nahi karta (diagnostic error). Ab wo Redis se replace ho gaya.

### 5.4 Rate limiting (`src/middlewares/rateLimit.ts`)

Auth routes pe brute-force rokta hai — Redis `INCR` + `EXPIRE` (fixed window):
```ts
router.post("/signup", rateLimit({ max: 5,  windowSec: 600 }), Signup)   // 5 / 10 min
router.post("/verify", rateLimit({ max: 10, windowSec: 600 }), Verify)   // 10 / 10 min
```
- Har IP+route ka ek counter. Pehli request pe TTL set, limit cross → `429`.
- **Fail-open:** Redis down ho to requests block nahi hoti (availability > strictness).
- Ye per-IP hai; per-user OTP brute-force alag se `verifyOtp` ke attempts se rukta hai.

---

## Ab tak ka Summary

| Cheez | Status |
|---|---|
| `redis` package install (pnpm) | ✅ ho gaya |
| `src/db/redis.ts` client (crash-proof, reconnect, shutdown) | ✅ ban gaya |
| App startup pe `connectRedis()` wire karna | ✅ ho gaya |
| OTP ko Redis pe le jaana (`SETEX`/hash + `INCR`) — `lib/otp.ts` | ✅ ho gaya |
| Verify flow Redis pe + purana `db.Otps` bug fix | ✅ ho gaya |
| Rate limiting middleware + signup/verify pe laga | ✅ ho gaya |
| `.env.example` me Redis vars | ✅ ho gaya |
| Ye doc | ✅ padh rahe ho 🙂 |

**Ek line me:** Redis = fast in-memory key-value store. OTP ab Redis me (TTL se
auto-expire, `INCR` se attempt-limit, one-time use), auth routes pe rate-limiting,
aur client crash-proof + auto-reconnect. Sab wire ho chuka hai — bas `redis-server`
chalu hona chahiye.

> ⚠️ **Zaroori:** Ab OTP verify + rate-limit Redis pe depend karte hain. App chalane
> se pehle Redis server chalu hona chahiye (`brew services start redis` ya docker).
> Agar `REDIS_ENABLED=false` karo to rate-limit no-op ho jayega lekin OTP verify
> kaam nahi karega (kyunki store hi Redis hai).

---

## Chhoti glossary (jaldi reference)

- **In-memory** — data RAM me (fast, temporary).
- **Key / Value** — `otp:42` = key, `"839201"` = value.
- **TTL** — Time To Live, key kitni der zinda rahegi (seconds).
- **SETEX** — set + expiry ek saath.
- **INCR** — number ko atomic tareeqe se +1.
- **Atomic** — do request ek saath aayein to bhi result ganda na ho.
- **Idempotent** — ek kaam baar-baar karo to nateeja same rahe.
- **Backoff** — fail hone pe har baar zyada intezaar karke retry.
- **Jitter** — retry time me thoda random taake sab ek saath na karein.
