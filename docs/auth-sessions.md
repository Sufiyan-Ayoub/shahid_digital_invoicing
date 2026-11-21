# Sessions & Tokens — `_makeSession`, Access + Refresh (Roman Urdu)

Ye doc `_makeSession` aur token system explain karta hai — kya, kahan, kyun.
Redis wali doc: `docs/redis-setup.md`.

---

## 1. Do tarah ke token — kyun?

Login ke baad user ko **2 token** milte hain:

| Token | Umr | Kahan check hota | Kaam |
|---|---|---|---|
| **Access token** | chhoti (15 min) | sirf server ki key se (DB hit NAHI) | har API request ke saath bhejo — "main logged-in hoon" |
| **Refresh token** | lambi (30 din) | `sessions` table me (revocable) | access token expire ho jaye to naya lene ke liye |

**Kyun 2?** Access token short rakhte hain taake leak ho to jaldi bekaar ho jaye.
Lekin user ko baar-baar login na karna pade, isliye refresh token lamba hota hai —
usse chup-chaap naya access token mil jata hai. Aur refresh token DB me hai to
kabhi bhi **revoke** (logout / ban) kiya ja sakta hai.

---

## 2. Token banta kaise hai (`src/lib/session.ts`)

Dono token = `encrypt(...)` se bane (AES-256-GCM, `lib/crypto`). Encryption yahan
**signature** ka kaam bhi karta hai: sirf server ke paas key hai, to jo token saaf
decrypt ho gaya woh **authentic + untampered** hai (GCM ka auth-tag guarantee).

```
ACCESS  = "access"  @@ uid @@ sid @@ role @@ expiresAtMs
REFRESH = "refresh" @@ uid @@ sid @@ secret
```

- `signAccessToken(uid, sid, role)` → access token banata hai (expiry andar hi).
- `readAccessToken(token)` → decode + validate. Tampered / expired / galat → `null`
  (throw nahi karta, taake caller bas `if (!claims) reject` likhe).
- `signRefreshToken` / `readRefreshToken` → same, refresh ke liye.

`sid` = session id (sessions table ka row id). `secret` = random raw string.

---

## 3. `_makeSession(req, user)` — session banana (`contorller.ts`)

Ye function login/verify ke baad call hota hai. Steps:

1. **Device info** nikaalo: `getIp(req)`, `getUserAgent(req)`, `Geo(ip)`
   (Geo external call hai — fail ho to bhi login na ruke, `try/catch`).
2. **Refresh secret** banao: `secret = randomToken()` (random raw string).
3. Uska **hash** banao: `sha256(secret)`. **DB me sirf hash jata hai, raw secret
   kabhi nahi** — agar DB leak ho to bhi koi token nahi bana sakta.
4. `sessions` table me **row insert** karo:
   - `token` = hash, `user_agent` = JSON, `geo` = JSON, `einfo` = `encrypt(ip)`
     (encrypted IP), `expiry` = 30 din baad.
5. Wapas do token do:
   - `accessToken = signAccessToken(uid, sid, role)`
   - `refreshToken = signRefreshToken(uid, sid, secret)` (raw secret client ko)

Yani: **ek `sessions` row hi refresh token hai.** Row ka hash + client ka raw
secret milke prove karte hain ki refresh token asli hai.

---

## 4. `_makeSession` kahan-kahan use hua

| Jagah | Kab session banta |
|---|---|
| **Signup** | Agar `mail_verification` OFF hai → seedha login (token response me). |
| **Verify** | OTP/link verify hone ke baad account activate → turant login. |
| _(Login — abhi banaya nahi)_ | Aage aayega. |

Dono jagah response me `accessToken` + `refreshToken` bhejte hain.

---

## 5. `Refresh` endpoint — naya access token lena

`POST /v1/auth/refresh  { token: <refreshToken> }`

Logic (`Refresh` controller):
1. `readRefreshToken(token)` → `{ uid, sid, secret }`. Galat → `401`.
2. `sessions` + `users` join karke row nikaalo (`sid` se).
3. **Sab guard ek saath:** row exist kare, usi user ka ho, `revoked_at` null ho,
   `expiry` future me ho, aur `sha256(secret)` DB ke hash se match kare.
4. User banned/deleted na ho.
5. Sab theek → **naya access token** de do (refresh token wahi rehta hai).

> Note: yahan refresh token **rotate** nahi kiya (simple rakha). Zyada security ke
> liye har refresh pe naya secret bhi de sakte ho — baad me add kar sakte hain.

---

## 6. Rate limiting

Teeno auth route pe Redis rate-limit laga hai (`middlewares/rateLimit.ts`):
```ts
/signup   → 5  / 10 min per IP
/verify   → 10 / 10 min per IP
/refresh  → 30 / 10 min per IP
```

---

## 7. Schema — Redis ke baad kya UNUSED ho gaya ⚠️

Aapne poocha tha. Jawab:

### ❌ `otps` table — ab BILKUL use nahi hoti
OTP poori tarah Redis me chala gaya. Is table ki har cheez ab Redis me hai:
- `token` (the otp) + `attempts` → Redis hash `otp:verify:<uid>` `{ code, attempts }`
- `expiry` → Redis TTL (auto-delete)

**Aap ye drop kar sakte ho:**
```sql
drop table otps;
```
Aur `src/db/schema.ts` me ye bhi hatana (types):
- `OtpsRow`, `OtpsInsert`, `OtpsUpdate` (interfaces/type)
- DB map me `'otps': { Row: ...; Insert: ...; Update: ... }` wali line

### ✅ `sessions` table — ab POORI use hoti hai
`_makeSession` ne is table ko zinda kar diya. Har column use ho raha:
- `uid`, `token` (hash), `user_agent`, `geo`, `einfo` (encrypted IP),
  `revoked_at` (revoke/logout ke liye), `expiry`, `stamp`.

### ✅ `users`, `settings` — pehle jaise use ho rahi
Koi change nahi.

> Baaki sab (enums `user_role`, `user_status`, indexes, triggers) waise ke waise
> use me hain — sirf `otps` hatana hai.

---

## Summary (ek line me)

Login pe `_makeSession` ek `sessions` row (refresh token ka hash + device info)
banata hai aur do token deta hai: chhota **access** (self-contained) + lamba
**refresh** (revocable). `Refresh` endpoint refresh token se naya access deta hai.
OTP Redis me chale jaane se **`otps` table ab unused hai — drop kar sakte ho.**
