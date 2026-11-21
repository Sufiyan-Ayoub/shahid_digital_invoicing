#!/usr/bin/env bash
#
# migrate.sh — ek hi command me poora Prisma Next migration flow.
#
# Kya karta hai:
#   1. Migration ka naam poochta hai (ya pehle argument se le leta hai)
#   2. contract emit  -> contract.json / contract.d.ts refresh
#   3. migration plan -> naya migration folder banata hai + SQL dikhata hai
#   4. aapki confirmation ke baad apply karta hai + `db` ref advance karta hai
#      (isse agli baar PLAN_ORIGIN_UNKNOWN error kabhi nahi aayega)
#
# Use:
#   pnpm db:new                 # naam interactive poochega
#   pnpm db:new add_user_avatar # naam seedha de do
#   pnpm db:new add_user_avatar --yes   # bina confirmation ke apply

set -euo pipefail

# ---- project root pe pahucho (script kahin se bhi chale) --------------------
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ---- rang (thoda saaf output) ----------------------------------------------
BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; RED=$'\033[31m'
YELLOW=$'\033[33m'; CYAN=$'\033[36m'; RESET=$'\033[0m'

step() { printf "\n%s==>%s %s%s%s\n" "$CYAN" "$RESET" "$BOLD" "$1" "$RESET"; }
ok()   { printf "%s✓%s %s\n" "$GREEN" "$RESET" "$1"; }
die()  { printf "\n%s✗ %s%s\n" "$RED" "$1" "$RESET" >&2; exit 1; }

# ---- arguments parse karo --------------------------------------------------
NAME=""
AUTO_YES=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) AUTO_YES=1 ;;
    -*)       die "Unknown flag: $arg" ;;
    *)        [ -z "$NAME" ] && NAME="$arg" ;;
  esac
done

# ---- naam poocho (agar nahi diya) ------------------------------------------
if [ -z "$NAME" ]; then
  printf "%sMigration ka naam kya rakhein?%s (e.g. add_user_avatar)\n> " "$BOLD" "$RESET"
  read -r NAME
fi

# naam saaf karo: spaces -> _, sirf a-z0-9_ allow
NAME="$(printf '%s' "$NAME" | tr '[:upper:]' '[:lower:]' | tr ' -' '__' | tr -cd 'a-z0-9_')"
[ -z "$NAME" ] && die "Naam khaali hai — kuch valid likho (a-z, 0-9, _)."
ok "Migration name: ${BOLD}${NAME}${RESET}"

# ---- 1. contract emit ------------------------------------------------------
step "Contract emit kar rahe hain..."
EMIT_OUT="$(mktemp)"
if ! npx prisma contract emit >"$EMIT_OUT" 2>&1; then
  # sirf human-readable diagnostics nikaal ke dikhao (raw JSON nahi)
  node -e '
    const fs=require("fs");
    const lines=fs.readFileSync(process.argv[1],"utf8").split("\n").filter(Boolean);
    for(const l of lines){try{const o=JSON.parse(l);const e=(o.envelope||o).error;
      if(e){console.error("  "+(e.summary||e.code));
        for(const d of (e.meta&&e.meta.issues)||[]) console.error("  • "+d.message);}
    }catch{}}
  ' "$EMIT_OUT" >&2 || cat "$EMIT_OUT" >&2
  rm -f "$EMIT_OUT"
  die "contract emit fail hua — upar diye diagnostics theek karo, phir dobara chalao."
fi
rm -f "$EMIT_OUT"
ok "Contract emit done."

# ---- 2. migration plan -----------------------------------------------------
step "Migration plan bana rahe hain..."
PLAN_OUT="$(mktemp)"
if ! npx prisma migration plan --name "$NAME" --json >"$PLAN_OUT" 2>&1; then
  cat "$PLAN_OUT"
  rm -f "$PLAN_OUT"
  die "migration plan fail hua (upar dekho). Agar PLAN_ORIGIN_UNKNOWN aaya to \`db\` ref set karna padega."
fi

# JSON parse: noOp / operations / dir / SQL preview
PARSED="$(node -e '
  const fs = require("fs");
  const lines = fs.readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean);
  let res = null;
  for (const l of lines) {
    try {
      const o = JSON.parse(l);
      const env = o.envelope ?? o;
      if ((env.commandId === "migration.plan" || o.commandId === "migration.plan") && env.result) res = env.result;
    } catch {}
  }
  if (!res) { console.log("PARSE_FAIL"); process.exit(0); }
  if (res.noOp) { console.log("NOOP"); process.exit(0); }
  const ops = (res.operations || []).map(o => "  • " + (o.label || o.id)).join("\n");
  const sql = ((res.preview && res.preview.statements) || []).map(s => "  " + s.text).join("\n");
  console.log("DIR\t" + (res.dir || ""));
  console.log("OPS_START"); console.log(ops); console.log("OPS_END");
  console.log("SQL_START"); console.log(sql); console.log("SQL_END");
' "$PLAN_OUT")"
rm -f "$PLAN_OUT"

if printf '%s' "$PARSED" | grep -q '^NOOP$'; then
  ok "Koi change nahi mila — contract aur DB already in-sync hain. Kuch apply karne ki zarurat nahi."
  exit 0
fi
printf '%s' "$PARSED" | grep -q '^PARSE_FAIL$' && die "Plan output parse nahi hua. Manually \`npx prisma migration plan --name $NAME\` chala ke dekho."

DIR="$(printf '%s' "$PARSED" | awk -F'\t' '/^DIR\t/{print $2}')"
OPS="$(printf '%s' "$PARSED" | awk '/^OPS_START$/{f=1;next}/^OPS_END$/{f=0}f')"
SQL="$(printf '%s' "$PARSED" | awk '/^SQL_START$/{f=1;next}/^SQL_END$/{f=0}f')"

ok "Migration folder: ${BOLD}${DIR}${RESET}"
printf "\n%sPlanned changes:%s\n%s\n" "$BOLD" "$RESET" "$OPS"
printf "\n%sSQL:%s\n%s%s%s\n" "$BOLD" "$RESET" "$DIM" "$SQL" "$RESET"

# ---- 3. confirm + apply ----------------------------------------------------
if [ "$AUTO_YES" -ne 1 ]; then
  printf "\n%sYe DB pe apply karein?%s [y/N] " "$YELLOW" "$RESET"
  read -r CONFIRM
  case "$CONFIRM" in
    y|Y|yes|YES) ;;
    *) printf "\n%sRuk gaye.%s Migration folder bana hua hai; baad me apply kar sakte ho:\n  npx prisma db migrate --advance-ref db\n" "$YELLOW" "$RESET"; exit 0 ;;
  esac
fi

step "Migration apply kar rahe hain (+ db ref advance)..."
npx prisma db migrate --advance-ref db || die "db migrate fail hua (upar dekho)."

ok "Migration apply ho gaya aur ${BOLD}db${RESET} ref advance ho gaya."
printf "\n%sAgla step:%s changes commit kar do —\n  git add migrations/ src/prisma/\n  git commit -m \"db: %s\"\n" "$BOLD" "$RESET" "$NAME"
