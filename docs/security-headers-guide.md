# Security Headers — 0 se Hero (Roman Urdu Tutorial)

> Ye guide un HTTP **security response headers** ke baare mein hai jo hum `src/middlewares/security.ts` mein set karte hain. Maqsad: aapko har header ka **kya**, **kyun**, aur **konsa attack rokta hai** — sab samajh aa jaye.
>
> Sources: [helmet npm](https://www.npmjs.com/package/helmet) · [helmet README](https://github.com/helmetjs/helmet) · [OWASP Secure Headers](https://owasp.org/www-project-secure-headers/) · [MDN HTTP Headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers)

---

## 1. Security headers hain kya?

Jab browser aapke server se koi cheez maangta hai (page, API), server jawab (response) ke saath kuch **headers** bhejta hai. In mein se kuch headers browser ko **security instructions** dete hain — jaise "inline script mat chalao", "mujhe iframe mein mat dikhao", "hamesha https use karo".

Ye headers **server side** se lagte hain, aur **browser** inhe enforce karta hai. Yani ye aapke users ke browsers ko batate hain ke kaunsi cheezein **allowed** hain aur kaunsi **block**.

**Ek misal (response):**
```
HTTP/1.1 200 OK
Content-Type: application/json
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Content-Security-Policy: default-src 'self'
...
```

Ye headers **XSS, clickjacking, MIME-sniffing, protocol-downgrade** jaise hamlon ke against defense-in-depth deti hain. Ye "silver bullet" nahi — balke **ek extra layer** hain, jo aapke baaki code (validation, escaping) ke saath milke security banati hain.

---

## 2. Har header — tafseel se

Neeche har header ka: **kya hai → konsa attack rokta → values → misal**.

### 2.1 `Content-Security-Policy` (CSP) — SABSE AHM ⭐

**Kya hai:** Ek "allow-list" jo browser ko batati hai ke page pe **kaunse sources** se script/style/image/font waghera load ho sakte hain, aur inline script chale ya na chale.

**Konsa attack rokta:** **XSS (Cross-Site Scripting)** — CSP ka sabse bada faida. Agar attacker koi `<script>` inject kar bhi de, `script-src 'self'` uski inline/external script ko **chalne hi nahi deta**.

**Ahम directives:**

| Directive | Kaam |
|---|---|
| `default-src 'self'` | fallback — sab kuch sirf apni site se |
| `script-src 'self'` | script sirf apni site se; inline `<script>` block |
| `style-src 'self'` | CSS sirf apni site se |
| `img-src 'self' data:` | images apni site + `data:` URIs se |
| `object-src 'none'` | `<object>/<embed>` band (purane plugin holes) |
| `base-uri 'self'` | `<base>` tag hijack rokna |
| `frame-ancestors 'self'` | koi doosri site aapko iframe mein na daal sake (clickjacking) |
| `form-action 'self'` | form sirf apni site pe submit ho |
| `script-src-attr 'none'` | inline event handlers (`onclick=`) block |
| `upgrade-insecure-requests` | http subresources ko auto https bana do |

**Sources ke matlab:**
- `'self'` → sirf apni origin
- `'none'` → kuch bhi nahi
- `'unsafe-inline'` → inline script/style allow (⚠️ XSS ke liye khatra — bachо)
- `'unsafe-eval'` → `eval()` allow (⚠️ bachо)
- `https:` → koi bhi https source
- `data:` → `data:` URIs (base64 images waghera)

**Inline script chahiye to? (nonce / hash):**
Agar aapke page ko genuinely inline script chahiye, `'unsafe-inline'` mat daalo — balke **nonce** use karo:
```
Content-Security-Policy: script-src 'self' 'nonce-RANDOM123'
```
```html
<script nonce="RANDOM123">/* ye chalega */</script>
```
Har response pe naya random nonce banao. Attacker ka inject kiya script nonce ke bagair block ho jayega.

**⚠️ Warning:** CSP sabse **taaqatwar** bhi hai aur sabse **nazuk** bhi. Ghalat likho to ya security kamzor, ya site tut jaye (console mein CSP errors aayenge). Browser console dekh ke tune karo.

---

### 2.2 `Strict-Transport-Security` (HSTS)

**Kya hai:** Browser ko force karta hai ke is domain pe **hamesha https** use kare, kabhi http nahi — chahe user `http://` type kare.

**Konsa attack rokta:** **SSL-stripping / man-in-the-middle** — attacker user ko http pe downgrade karke traffic parh/badal nahi sakta.

**Value:**
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```
- `max-age=31536000` → 1 saal (seconds mein). Browser itni der yaad rakhega.
- `includeSubDomains` → saare subdomains pe bhi https force.
- `preload` (optional) → browser ki built-in HSTS list mein aana (pehli visit se pehle bhi https). Sirf tab lagao jab poore domain + subdomains https ho.

**⚠️ Sirf production/https pe bhejo.** Localhost http pe iska matlab nahi — isi liye hum `NODE_ENV === "production"` check karte hain.

---

### 2.3 `X-Content-Type-Options`

**Kya hai:** Browser ko kehta hai ke `Content-Type` ko **"guess" (sniff) na kare** — bas jo server ne kaha wahi maane.

**Konsa attack rokta:** **MIME-sniffing** — agar server `text/plain` bheje par browser usay `<script>` samajh ke chala de. Ye us khatre ko rokta hai (jaise user-uploaded file ko script samajhna).

**Value:**
```
X-Content-Type-Options: nosniff
```
Sirf yahi ek value hai. Hamesha lagao.

---

### 2.4 `X-Frame-Options` + CSP `frame-ancestors`

**Kya hai:** Rokta hai ke aapke page ko koi doosri site `<iframe>` mein embed kare.

**Konsa attack rokta:** **Clickjacking** — attacker aapke page ko invisible iframe mein daal ke user se dhoke se click karwata hai (jaise "delete account" button pe).

**Value:**
```
X-Frame-Options: SAMEORIGIN
```
- `DENY` → koi bhi iframe nahi
- `SAMEORIGIN` → sirf apni site frame kar sakti hai

**Note:** `frame-ancestors 'self'` (CSP mein) iska **modern** version hai. `X-Frame-Options` purane browsers ke liye, `frame-ancestors` naye standard ke liye — **dono** rakhna defense-in-depth.

---

### 2.5 `Referrer-Policy`

**Kya hai:** Control karta hai ke jab user aapki site se doosri site pe jaye, to `Referer` header mein aapka URL kitna share ho.

**Konsa attack rokta:** **Information leak** — aapke URLs mein token/id ho sakte hain (`/reset?token=abc`), jo doosri site ko leak na hon.

**Value:**
```
Referrer-Policy: no-referrer
```
- `no-referrer` → kuch bhi mat bhejo (sabse safe)
- `strict-origin-when-cross-origin` → apni site pe poora URL, doosri site pe sirf origin (thoda kam sakht, analytics ke liye common)

---

### 2.6 `X-XSS-Protection`

**Kya hai:** Purana browser XSS filter.

**Value (counter-intuitive!):**
```
X-XSS-Protection: 0
```
**Isay 0 (OFF) rakhna hi sahi hai** — ye purana filter khud **buggy** tha aur naye bugs paida karta tha. Modern browsers ise hata chuke hain. Asli XSS defense **CSP** hai, ye header nahi. (helmet bhi jaan-boojh ke `0` set karta hai.)

---

### 2.7 `Cross-Origin-Opener-Policy` (COOP)

**Kya hai:** Aapke page ko doosre origins ki windows/tabs se **process-isolate** karta hai.

**Konsa attack rokta:** **Spectre-type** side-channel + cross-window attacks (jaise `window.opener` ka misuse).

**Value:**
```
Cross-Origin-Opener-Policy: same-origin
```

---

### 2.8 `Cross-Origin-Resource-Policy` (CORP)

**Kya hai:** Rokta hai ke doosre origins aapke resources (images, scripts) ko directly load karke istemaal karen.

**Konsa attack rokta:** Cross-origin resource theft / side-channel leaks.

**Value:**
```
Cross-Origin-Resource-Policy: same-origin
```
- `same-origin` → sirf apni origin
- `same-site` → apni site (subdomains bhi)
- `cross-origin` → sab (jab aap CDN/public API ho)

---

### 2.9 `Cross-Origin-Embedder-Policy` (COEP) — by default OFF

**Kya hai:** Page ko sirf wo cross-origin resources load karne deta hai jo explicitly permission dein.

**Kyun by default nahi lagate:** Ye aksar cheezein **tod deta hai** (third-party images/scripts). Sirf tab chahiye jab aapko `SharedArrayBuffer` jaisi advanced features chahiye. **helmet bhi ise default OFF rakhta hai.** Isi liye hum bhi nahi lagate — ye **sahi** hai.

---

### 2.10 `Origin-Agent-Cluster`

**Kya hai:** Browser ko hint deta hai ke is origin ko apne alag agent cluster (memory isolation) mein rakhe.

**Konsa attack:** Cross-origin memory side-channels ko aur mushkil banata.

**Value:**
```
Origin-Agent-Cluster: ?1
```
(`?1` ka matlab "true" hota hai — ye structured header syntax hai.)

---

### 2.11 `Permissions-Policy` — OWASP recommend karta, helmet NAHI karta ⭐

**Kya hai:** Control karta hai ke aapka page (aur uske iframes) kaunse **browser features** use kar sakte hain — camera, microphone, geolocation, payment waghera.

**Konsa attack rokta:** Agar XSS/malicious iframe aa jaye to wo user ki **camera/mic/location** access na kar sake.

**Recommended value (jo features aap use nahi karte, band kar do):**
```
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
```
- `camera=()` → khali brackets = **kisi ko bhi nahi** (poori tarah band)
- `interest-cohort=()` → Google FLoC tracking se opt-out

> **Ahм:** helmet ye header **set nahi karta**, lekin OWASP isay recommend karta hai. Ye genuinely add karne layak hai.

---

### 2.12 Legacy / kam-ahम headers

Ye helmet defaults mein hain par aaj kam ahмiyat rakhte:

| Header | Value | Kaam | Verdict |
|---|---|---|---|
| `X-DNS-Prefetch-Control` | `off` | DNS prefetch privacy | Optional |
| `X-Download-Options` | `noopen` | Purana IE8 download bug | Skip (IE dead) |
| `X-Permitted-Cross-Domain-Policies` | `none` | Flash/PDF cross-domain | Optional (Flash dead) |

Inhe lagana harmless hai par zaroori nahi. Chaho to consistency ke liye laga do.

---

### 2.13 `X-Powered-By` — hataना

Express by default `X-Powered-By: Express` bhejta hai, jo attacker ko aapka stack bata deta hai. Ise **hatao**:
```ts
app.disable("x-powered-by");        // Express ko set hi na karne do
// ya
resp.removeHeader("X-Powered-By");  // set hone ke baad hatana
```
Dono theek. (helmet bhi ye hata deta hai.)

> **Nginx note:** Agar aap nginx ke peeche ho, to `Server: nginx` header bhi leak karta hai — usay **nginx level** pe `server_tokens off;` se hatao.

---

## 3. Hamara current setup — Verification (vs helmet v8 + OWASP)

Ye raha comparison. **Hamara koi bhi header GALAT ya OUTDATED nahi** — bas kuch behtar values aur kuch additions mumkin hain.

| Header | Hamari value | helmet/OWASP | Status |
|---|---|---|---|
| `X-Content-Type-Options` | `nosniff` | `nosniff` | ✅ perfect |
| `X-Frame-Options` | `SAMEORIGIN` | `SAMEORIGIN` | ✅ perfect |
| `Referrer-Policy` | `no-referrer` | `no-referrer` | ✅ perfect |
| `X-XSS-Protection` | `0` | `0` | ✅ perfect (0 hi sahi) |
| `Cross-Origin-Opener-Policy` | `same-origin` | `same-origin` | ✅ perfect |
| `Cross-Origin-Resource-Policy` | `same-origin` | `same-origin` | ✅ perfect |
| `X-Powered-By` | removed | removed | ✅ perfect |
| `Strict-Transport-Security` | `max-age=15552000` (180 din) | `max-age=31536000` (1 saal) | ⚠️ badhana behtar |
| `Origin-Agent-Cluster` | ❌ nahi | `?1` | ➕ add karo (asaan) |
| `Permissions-Policy` | ❌ nahi | OWASP recommend | ➕ add karo (ahм) |
| CSP `form-action` | ❌ nahi | `'self'` | ➕ add karo |
| CSP `script-src-attr` | ❌ nahi | `'none'` | ➕ add karo |
| CSP `upgrade-insecure-requests` | ❌ nahi | ✅ | ➕ add karo (prod) |
| `X-DNS-Prefetch-Control` | ❌ nahi | `off` | Optional |
| `X-Download-Options` | ❌ nahi | `noopen` | Skip (legacy) |
| `X-Permitted-Cross-Domain-Policies` | ❌ nahi | `none` | Optional |
| `Cross-Origin-Embedder-Policy` | ❌ nahi (sahi) | helmet bhi nahi | ✅ sahi faisla |

### CSP ka farق — ek nukta

Hamari CSP: `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'`

helmet ki CSP is se **thodi zyada permissive** hai (`img-src 'self' data:`, `font-src 'self' https: data:`, `style-src 'self' https: 'unsafe-inline'`). Kyunki hamari CSP mein wo directives nahi, wo `default-src 'self'` pe fall back karti hain — yani **hamari CSP helmet se ZYADA sakht hai**.

- ✅ Zyada sakht = zyada secure
- ⚠️ Lekin ye toड sakti hai: `data:` images, inline styles, external fonts block honge. Agar aap HTML/frontend serve karte ho to console mein CSP errors dekh ke `img-src`/`style-src` adjust karna.

---

## 4. Behtar (recommended) middleware

Verification ke baad, ye "upgraded" version hai (additions **bold** comments ke saath):

```ts
import type { Request, Response, NextFunction } from "express";

export const securityHeaders = (_req: Request, resp: Response, next: NextFunction): void => {

    resp.setHeader("X-Content-Type-Options", "nosniff");
    resp.setHeader("X-Frame-Options", "SAMEORIGIN");
    resp.setHeader("Referrer-Policy", "no-referrer");
    resp.setHeader("X-XSS-Protection", "0");
    resp.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    resp.setHeader("Cross-Origin-Resource-Policy", "same-origin");

    // ➕ NAYA: origin isolation (helmet default)
    resp.setHeader("Origin-Agent-Cluster", "?1");

    // ➕ NAYA: browser features band jo hum use nahi karte (OWASP recommend)
    resp.setHeader(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
    );

    // ⚠️ max-age ab 1 saal (helmet default); sirf production/https pe
    if (process.env.NODE_ENV === "production") {
        resp.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    // CSP — ➕ form-action, script-src-attr, aur prod pe upgrade-insecure-requests
    const csp = [
        "default-src 'self'",
        "script-src 'self'",
        "script-src-attr 'none'",   // ➕ inline onclick= waghera block
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'self'",
        "form-action 'self'",       // ➕ form sirf apni site pe submit
    ];
    if (process.env.NODE_ENV === "production") {
        csp.push("upgrade-insecure-requests");   // ➕ http subresources → https
    }
    resp.setHeader("Content-Security-Policy", csp.join("; "));

    resp.removeHeader("X-Powered-By");

    next();
}
```

---

## 5. Test kaise karein

**1. Command line (curl):**
```bash
curl -sI https://your-domain.com | grep -iE "content-security|strict-transport|x-frame|x-content|referrer|permissions|cross-origin"
```

**2. Online scanners:**
- [securityheaders.com](https://securityheaders.com) — grade (A+ se F) deta hai
- [securityheaders.fyi](https://securityheaders.fyi)

**3. Browser DevTools:**
Network tab → koi request → Response Headers dekho. CSP errors Console tab mein aayenge.

---

## 6. Yaad rakhne wali batein (khulasa)

1. **Security headers = defense-in-depth**, akela solution nahi. Asli XSS defense **CSP + output escaping** hai.
2. **CSP** sabse ahм + sabse nazuk — tune karke lagao, console errors dekho.
3. **HSTS** sirf production/https pe.
4. **`X-XSS-Protection: 0`** — jaan-boojh ke OFF (0 hi sahi hai).
5. **`Permissions-Policy`** helmet nahi karta par OWASP recommend karta — add karo.
6. **COEP** default OFF rakhna sahi (cheezein todta hai).
7. Headers **token ki hifazat nahi karte** — wo cookie flags (`httpOnly`, `SameSite`) aur XSS prevention ka kaam hai. Ye alag layer hai.

---

## Sources

- [helmet — npm](https://www.npmjs.com/package/helmet) (v8.x defaults)
- [helmet — GitHub README](https://github.com/helmetjs/helmet)
- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)
- [MDN — HTTP Headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers)
- [MDN — Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy)
- [MDN — Permissions-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy)
