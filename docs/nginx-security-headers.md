# Nginx pe Security Headers — Setup Guide (Roman Urdu)

> Ye guide batati hai ke security headers **nginx ke edge pe** kaise lagate hain, taake **frontend (React) aur backend (Express) dono** ek hi jagah se cover ho jayen.
>
> **Note:** Hamari `src/middlewares/security.ts` middleware filhal **mount nahi** hai (app.ts mein `app.use` nahi). Headers ab **nginx** laga raha hai — single source of truth. Ye isi liye hai ke dono jagah same header lagane se **duplicate CSP** ka conflict na ho.

---

## 1. Architecture — nginx dono ke aage

```
                 ┌────────────────────────────────────┐
   Browser  ───► │  nginx  (https, single entry point) │
                 │                                      │
                 │   /        →  React static build     │  ← headers yahan
                 │   /api/    →  proxy to Express :3001  │  ← headers yahan bhi
                 └────────────────────────────────────┘
```

Kyunki nginx **dono** ko serve/proxy karta hai, headers nginx pe lagao → dono responses pe lag jayenge. Frontend aur backend **same origin** (`app.com`) ban jate hain → cookies ke liye bhi behtar (`SameSite=Strict` chalega, no CORS).

---

## 2. Ahм: `add_header` ki inheritance gotcha ⚠️

nginx mein agar kisi `location` block mein `add_header` likho, to wo **parent (`server`/`http`) ke saare `add_header` ko override** kar deta hai (merge nahi karta). Yani agar aap `server` level pe headers daalo aur kisi `location` mein ek aur `add_header` daal do, to us location mein **sirf wahi ek** header lagega, baaki gayab.

**Hal:** headers ko ek alag **snippet file** mein rakho aur har `location` block mein `include` kar do. Is tarah har location ko poore headers milte hain, aur override ka masla nahi.

---

## 3. Step 1 — Headers snippet file banao

File: `/etc/nginx/snippets/security-headers.conf`

```nginx
# ---- Security headers (frontend + backend dono ke liye) ----
# `always` = error responses (4xx/5xx) pe bhi lagen.

add_header X-Content-Type-Options        "nosniff"                                                     always;
add_header X-Frame-Options               "DENY"                                                        always;
add_header Referrer-Policy               "no-referrer"                                                 always;
add_header X-XSS-Protection              "0"                                                           always;
add_header Cross-Origin-Opener-Policy    "same-origin"                                                 always;
add_header Cross-Origin-Resource-Policy  "same-origin"                                                 always;
add_header Origin-Agent-Cluster          "?1"                                                          always;
add_header Permissions-Policy            "camera=(), microphone=(), payment=(), usb=(), interest-cohort=()" always;

# CSP — XSS ka sabse bada defense. React ke hisaab se tune karna pad sakta (neeche dekho).
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; script-src-attr 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'; upgrade-insecure-requests" always;

# HSTS — sirf https pe. (Ye line sirf 443/ssl server block mein include karni; http pe nahi.)
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

> Agar aap http→https redirect wala alag `server { listen 80; }` block rakhte ho, to usmein HSTS **mat** daalo. HSTS sirf https (443) response pe.

---

## 4. Step 2 — Server block mein include karo

File: `/etc/nginx/sites-available/app.com` (ya jo aapki config ho)

```nginx
# http → https redirect (HSTS yahan NAHI)
server {
    listen 80;
    server_name app.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.com;

    # TLS certs
    ssl_certificate     /etc/letsencrypt/live/app.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.com/privkey.pem;

    # "Server: nginx" version chhupao
    server_tokens off;

    # ---- Frontend: React static build ----
    location / {
        root /var/www/app/dist;          # apni build path
        try_files $uri /index.html;       # SPA fallback
        include snippets/security-headers.conf;
    }

    # ---- Backend: Express API ----
    location /api/ {
        proxy_pass http://127.0.0.1:3001/;   # trailing / = /api hata ke backend ko bheje

        # Standard proxy headers (getIp, etc. ke liye zaroori)
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        include snippets/security-headers.conf;   # <-- har location mein dobara include
    }
}
```

**Dhyan dein:**
- `include snippets/security-headers.conf;` **har location** mein hai — inheritance gotcha (section 2) ki wajah se.
- `/api/` wala `proxy_pass` path se `/api` hata ke backend ko `/` pe bhejta hai. Agar aap chahte ho ke backend ko poora `/api/...` mile, to `proxy_pass http://127.0.0.1:3001;` (bina trailing `/`). Apni routing ke hisaab se rakho.

---

## 5. Step 3 — Test aur reload

```bash
# Config syntax check
sudo nginx -t

# Sahi ho to reload (downtime ke bagair)
sudo systemctl reload nginx
```

**Headers verify karo:**
```bash
# Frontend
curl -sI https://app.com/ | grep -iE "content-security|x-frame|x-content|referrer|permissions|strict-transport|cross-origin"

# Backend
curl -sI https://app.com/api/health | grep -iE "content-security|x-frame|strict-transport"
```

Ya online: [securityheaders.com](https://securityheaders.com) pe apna domain daal ke grade dekho.

---

## 6. CSP — React ke liye tuning (ahм)

`script-src 'self'` React ke **inline runtime script** ko block kar sakta hai → app blank/toot sakti. Browser **Console** mein CSP errors aayenge. Hal:

- **Create React App (react-scripts):** build se pehle inline runtime band karo:
  ```bash
  INLINE_RUNTIME_CHUNK=false npm run build
  ```
  Phir `script-src 'self'` clean chalega.

- **Vite:** zyadatar external module scripts hote hain; agar inline ho to CSP nonce/hash plugin use karo.

- **Inline styles:** agar app inline styles use karti hai aur block hoti dikhe, to `style-src 'self' 'unsafe-inline'` add kar sakte ho (styles ke liye risk scripts se kam hai). CSP string mein add karo:
  ```
  ... ; style-src 'self' 'unsafe-inline'; ...
  ```

- **Images / fonts (data: ya external):** agar block hon to `img-src 'self' data:;` `font-src 'self' data:;` add karo.

> Production deploy se pehle browser console zaroor check karna — CSP errors ko ek-ek karke allow karte jao (sabse sakht se start, zaroorat par thoda khulo).

---

## 7. Agar nginx kabhi beech se hat jaye (fallback)

Headers sirf nginx pe hain — agar future mein nginx entry point na rahe (ya koi Express ko directly hit kare), to headers nahi lagenge. Us soorat mein:

- `src/middlewares/security.ts` maujood hai — `app.ts` mein `app.use(securityHeaders)` se mount kar lo.
- **Lekin phir nginx wale headers hata dena** (warna duplicate CSP conflict).

Dono jagah **same header** kabhi mat rakho.

---

## 8. Khulasa checklist

- [ ] `snippets/security-headers.conf` banaya (section 3)
- [ ] Har `location` block mein `include` kiya (frontend + /api)
- [ ] HSTS sirf https (443) block mein
- [ ] `server_tokens off;` (Server header chhupao)
- [ ] `nginx -t` pass, phir `reload`
- [ ] `curl -I` ya securityheaders.com se verify
- [ ] React CSP tune kiya (`INLINE_RUNTIME_CHUNK=false` / Vite nonce), console errors saaf
- [ ] Express middleware mount NAHI (duplication se bachne)

---

## Header values reference (jo hamari security.ts mein finalize huay)

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |
| `X-XSS-Protection` | `0` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Origin-Agent-Cluster` | `?1` |
| `Permissions-Policy` | `camera=(), microphone=(), payment=(), usb=(), interest-cohort=()` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (https only) |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; script-src-attr 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'; upgrade-insecure-requests` |

> Detail ke liye har header ka kaam: `docs/security-headers-guide.md` dekho.
