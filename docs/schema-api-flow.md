# Backend Schema & API Flow

> Source of truth: `src/prisma/contract.prisma` (Prisma Next / Prisma 8)
> Yeh doc batata hai ke current schema ke hisaab se backend API's ka flow kya hoga.

---

## 1. Data Models (schema overview)

Namespace: `public`

### `Users` — core account
| Field | Type | Notes |
|-------|------|-------|
| `id` | Int, PK, auto-increment | primary key |
| `googleId` | String? | OAuth (Google) linkage → `google_id` |
| `facebookId` | String? | OAuth (Facebook) linkage → `facebook_id` |
| `dp` | String? | display picture URL |
| `nm` | String? | name |
| `em` | String? | email |
| `psw` | String? | password (hash store karna hai) |
| `phone` | String? | phone number |
| `dob` | Date? | date of birth |
| `status` | enum `UserStatus`? | default `in_active` |
| `lseen` | Timestamptz? | last seen |
| `lockedUntil` | Timestamptz? | account lock expiry → `locked_until` |
| `deletedAt` | Timestamptz? | soft delete → `deleted_at` |
| `stamp` | Timestamptz | created at (default now) |
| `modified` | Timestamptz | updated at (default now) |

Relations: `otps Otps[]`, `sessions Sessions[]`
Indexes: `em`, `phone`, `deletedAt`, `(em, status)`

### `Otps` — OTP / verification tokens
| Field | Type | Notes |
|-------|------|-------|
| `id` | Int, PK | |
| `uid` | Int | FK → `Users.id` (cascade delete) |
| `attempts` | SmallInt | default 0, brute-force guard |
| `_type` | String | OTP purpose → `type` (e.g. `signup`, `login`, `reset`, `phone`) |
| `token` | String | OTP code / hashed code |
| `expiry` | Timestamptz? | expiry window |
| `stamp` | Timestamptz | created at |

### `Sessions` — active login sessions
| Field | Type | Notes |
|-------|------|-------|
| `id` | Int, PK | |
| `uid` | Int | FK → `Users.id` (cascade delete) |
| `token` | String | session / refresh token (hashed) |
| `userAgent` | String | client UA → `user_agent` |
| `geo` | String | geo location |
| `einfo` | String | extra device info |
| `revokedAt` | Timestamptz? | logout / revoke → `revoked_at` |
| `expiry` | Timestamptz | session expiry |
| `stamp` / `modified` | Timestamptz | created / updated |

### `Settings` — key/value app settings
| Field | Type | Notes |
|-------|------|-------|
| `id` | Int, PK | |
| `okey` | String | option key |
| `ovalue` | String | option value |
| `stamp` / `modified` | Timestamptz | created / updated |

### `UserStatus` (native enum → `user_status`)
`in_active` · `active` · `suspended` · `deleted` · `banned`

---

## 2. Account Lifecycle (status machine)

```
in_active ──(email/phone OTP verified)──► active
active ──(admin action)──► suspended / banned
active/any ──(user delete)──► deleted   (+ deletedAt set = soft delete)
suspended ──(admin restore)──► active
```

- Naya user hamesha `in_active` banta hai.
- `active` tabhi hota hai jab OTP verify ho jaye.
- `deleted` status + `deletedAt` timestamp = soft delete (row rehti hai, queries mein `deletedAt IS NULL` filter lagana).
- `banned` / `suspended` par login block; `lockedUntil` se temporary lock (failed attempts) handle hota hai.

---

## 3. API Flows

### 3.1 Signup (email + password)
```
POST /auth/signup   { em, psw, nm?, phone? }
```
1. `em` par existing user check (`idx_users_em`). Agar `active` mila → 409 conflict.
2. `psw` hash karo, `Users` insert with `status = in_active`.
3. `Otps` create: `{ uid, _type: "signup", token, expiry: now+10m, attempts: 0 }`.
4. OTP email/SMS bhejo.
5. Response: `201` + `userId` (auth token abhi nahi — pehle verify).

### 3.2 Verify OTP → activate
```
POST /auth/verify-otp   { uid, _type, token }
```
1. Latest non-expired `Otps` row uthao (`uid`, `_type`).
2. `attempts` limit check (e.g. > 5 → block, cooldown).
3. Token match:
   - **Match** → `Users.status = active`, OTP row consume/delete, session create (§3.5).
   - **Mismatch** → `attempts++`, 400.
4. Expiry cross → 410, resend flow.

### 3.3 Login (email + password)
```
POST /auth/login   { em, psw }
```
1. User by `em`; agar na mile → 401 (generic message).
2. Guards:
   - `status IN (banned, suspended, deleted)` → 403.
   - `lockedUntil > now` → 423 locked.
3. `psw` compare:
   - **Fail** → failed-attempt count barhao; threshold par `lockedUntil = now + N min`.
   - **Success** → `lseen = now`, session create (§3.5), tokens return.

### 3.4 OAuth login (Google / Facebook)
```
POST /auth/oauth/google     { idToken }
POST /auth/oauth/facebook   { accessToken }
```
1. Provider token verify → profile (`googleId`/`facebookId`, `em`, `nm`, `dp`).
2. Match order: `googleId`/`facebookId` → warna `em` → warna naya user.
3. Naya OAuth user directly `status = active` (provider ne email verify kar rakhi hoti hai), OTP skip.
4. Existing `em` mile to provider id link kar do.
5. Session create (§3.5).

### 3.5 Session issuance (shared step)
- `Sessions` insert: `{ uid, token: hash(refresh), userAgent, geo, einfo, expiry: now+30d }`.
- Access token (short-lived JWT) + refresh token (session `token`) return.
- `lseen = now` update.

### 3.6 Refresh token
```
POST /auth/refresh   { refreshToken }
```
1. Session by hashed token; `revokedAt IS NULL` aur `expiry > now` check.
2. Naya access token; optionally rotate refresh (`modified = now`).

### 3.7 Logout / revoke
```
POST /auth/logout          → current session revoke
POST /auth/logout-all      → user ke saare sessions revoke
```
- `Sessions.revokedAt = now` set (row delete ke bajaye audit ke liye revoke).

### 3.8 Forgot / reset password
```
POST /auth/forgot-password  { em }        → Otps { _type: "reset" } + email
POST /auth/reset-password    { uid, token, newPsw }
```
- OTP verify → `psw` hash update → optionally saari sessions revoke (security).

### 3.9 Profile
```
GET   /me            → current user (deletedAt IS NULL)
PATCH /me            → nm, dp, phone, dob update (modified = now)
DELETE /me           → soft delete: status = deleted, deletedAt = now, sessions revoke
```

### 3.10 Settings (app-level / admin)
```
GET   /settings/:okey
PUT   /settings/:okey   { ovalue }
```
- Key/value store; `modified = now` on update.

---

## 4. Cross-cutting Rules

- **Soft delete**: har user read query mein `deletedAt IS NULL` (ya `status != deleted`) filter zaroori. Index `idx_users_deleted_at` isi liye hai.
- **Secrets**: `psw` aur session/OTP `token` hamesha hashed store karo, plain kabhi nahi.
- **Brute-force**: `Otps.attempts` + `Users.lockedUntil` dono milke rate-limit / lock enforce karte hain.
- **Cascade**: user delete par `Otps` aur `Sessions` DB-level cascade se hat jaate hain (`onDelete: Cascade`).
- **Indexes ka use**: login/lookup `em` aur `(em, status)` index par; phone lookup `phone` index par.
- **Timestamps**: `stamp` = created, `modified` = updated — write path mein `modified = now()` khud set karna.

---

## 5. Endpoint → Model Map

| Endpoint | Reads | Writes |
|----------|-------|--------|
| `POST /auth/signup` | Users | Users, Otps |
| `POST /auth/verify-otp` | Otps | Users, Otps, Sessions |
| `POST /auth/login` | Users | Users (lseen/lock), Sessions |
| `POST /auth/oauth/*` | Users | Users, Sessions |
| `POST /auth/refresh` | Sessions | Sessions |
| `POST /auth/logout*` | Sessions | Sessions |
| `POST /auth/forgot-password` | Users | Otps |
| `POST /auth/reset-password` | Otps | Users, Sessions |
| `GET/PATCH/DELETE /me` | Users | Users, Sessions |
| `GET/PUT /settings/:okey` | Settings | Settings |

---

*Note: `src/app.ts` / `src/config.ts` abhi empty hain — yeh doc schema-derived intended flow hai, implemented endpoints nahi. Jaise-jaise routes banti jayein, is table ko update karte rehna.*
