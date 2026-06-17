#!/usr/bin/env bash
#
# Setup Vercel Cron Secret
# ───────────────────────────────────────────────────────────────────────────
# Sets the CRON_SECRET environment variable on the Vercel production project
# so the /api/dashboard-warmup cron job can authenticate.
#
# USAGE (two options):
#
# Option A — with a Vercel access token (recommended, fully automated):
#   1. Go to https://vercel.com/account/tokens
#   2. Create a token (scope: Full Account, expires in 7 days is fine)
#   3. Run:  VERCEL_TOKEN=your_token_here bun run scripts/setup-vercel-cron-secret.sh
#
# Option B — interactive login (if you have Vercel CLI installed & can login):
#   bun run scripts/setup-vercel-cron-secret.sh --login
#
# The secret value is read from .env (CRON_SECRET=...). If missing, a new
# cryptographically secure 64-char hex secret is generated and written back
# to .env before being pushed to Vercel.
#
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env"
VAR_NAME="CRON_SECRET"

# ── Step 1: Read or generate the secret ──
SECRET=""
if [[ -f "$ENV_FILE" ]]; then
  SECRET=$(grep -E "^${VAR_NAME}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"' || true)
fi

if [[ -z "$SECRET" ]]; then
  echo "⚠️  No ${VAR_NAME} found in ${ENV_FILE}. Generating a new secure secret..."
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  echo "" >> "$ENV_FILE"
  echo "# Cron Job Authentication Secret (auto-generated)" >> "$ENV_FILE"
  echo "${VAR_NAME}=${SECRET}" >> "$ENV_FILE"
  echo "✅ New secret written to ${ENV_FILE}"
else
  echo "✅ Found existing ${VAR_NAME} in ${ENV_FILE} (length: ${#SECRET} chars)"
fi

# ── Step 2: Determine Vercel project ──
# Try to read from .vercel/project.json (created by `vercel link`)
PROJECT_ID=""
ORG_ID=""
if [[ -f ".vercel/project.json" ]]; then
  PROJECT_ID=$(node -e "try{console.log(require('./.vercel/project.json').projectId)}catch{}" 2>/dev/null || true)
  ORG_ID=$(node -e "try{console.log(require('./.vercel/project.json').orgId)}catch{}" 2>/dev/null || true)
fi

# ── Step 3: Push to Vercel ──
if [[ "${1:-}" == "--login" ]]; then
  echo "🔐 Logging into Vercel (interactive)..."
  vercel login
  echo ""
  echo "📤 Linking project (if not already linked)..."
  vercel link --yes --project volterp-app 2>/dev/null || vercel link --yes 2>/dev/null || true
  echo "📤 Setting ${VAR_NAME} on Vercel (production)..."
  echo "$SECRET" | vercel env add "$VAR_NAME" production 2>/dev/null || {
    echo "ℹ️  Variable may already exist. Updating..."
    vercel env rm "$VAR_NAME" production --yes 2>/dev/null || true
    echo "$SECRET" | vercel env add "$VAR_NAME" production
  }
  echo "🔄 Redeploying to apply the new env var..."
  vercel --prod --yes
else
  if [[ -z "${VERCEL_TOKEN:-}" ]]; then
    echo ""
    echo "❌ VERCEL_TOKEN environment variable is not set."
    echo ""
    echo "To set CRON_SECRET on Vercel automatically:"
    echo "  1. Create a token at: https://vercel.com/account/tokens"
    echo "  2. Run: VERCEL_TOKEN=your_token_here bun run scripts/setup-vercel-cron-secret.sh"
    echo ""
    echo "OR set it manually in the Vercel dashboard:"
    echo "  1. Go to: https://vercel.com/[your-team]/volterp-app/settings/environment-variables"
    echo "  2. Click 'Add New'"
    echo "  3. Key:   CRON_SECRET"
    echo "  4. Value: ${SECRET}"
    echo "  5. Environment: Production (and Preview)"
    echo "  6. Click Save"
    echo ""
    echo "Your secret value (copy this):"
    echo "────────────────────────────────────────────────────────────────"
    echo "$SECRET"
    echo "────────────────────────────────────────────────────────────────"
    exit 1
  fi

  echo "📤 Pushing ${VAR_NAME} to Vercel using provided token..."

  # First, find the project
  PROJECT_SLUG="volterp-app"
  TEAM_SLUG="${VERCEL_TEAM:-}"

  # Try to get project info
  if [[ -n "$TEAM_SLUG" ]]; then
    PROJECT_RESP=$(curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
      "https://api.vercel.com/v9/projects/${PROJECT_SLUG}?teamId=${TEAM_SLUG}")
  else
    PROJECT_RESP=$(curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
      "https://api.vercel.com/v9/projects/${PROJECT_SLUG}")
  fi

  # Check if we got an error
  ERROR=$(echo "$PROJECT_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log(j.error?.message||j.error?.code||'')}catch{console.log('')}})" 2>/dev/null || true)
  if [[ -n "$ERROR" ]]; then
    echo "❌ Could not access project '${PROJECT_SLUG}'."
    echo "   Vercel API error: $ERROR"
    echo ""
    echo "   If your project has a different slug, set VERCEL_PROJECT_SLUG and retry."
    echo "   If you're on a team, set VERCEL_TEAM=<team-id-or-slug> and retry."
    exit 1
  fi

  # Create the env var via Vercel API
  if [[ -n "$TEAM_SLUG" ]]; then
    CREATE_RESP=$(curl -s -X POST \
      "https://api.vercel.com/v10/projects/${PROJECT_SLUG}/env?teamId=${TEAM_SLUG}&upsert=true" \
      -H "Authorization: Bearer $VERCEL_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"key\":\"${VAR_NAME}\",\"value\":\"${SECRET}\",\"type\":\"encrypted\",\"target\":[\"production\",\"preview\"]}")
  else
    CREATE_RESP=$(curl -s -X POST \
      "https://api.vercel.com/v10/projects/${PROJECT_SLUG}/env?upsert=true" \
      -H "Authorization: Bearer $VERCEL_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"key\":\"${VAR_NAME}\",\"value\":\"${SECRET}\",\"type\":\"encrypted\",\"target\":[\"production\",\"preview\"]}")
  fi

  # Check response
  RESP_KEY=$(echo "$CREATE_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log(j.key||j.error?.message||'FAILED')}catch{console.log('FAILED')}})" 2>/dev/null || true)

  if [[ "$RESP_KEY" == "$VAR_NAME" ]]; then
    echo "✅ ${VAR_NAME} set successfully on Vercel project '${PROJECT_SLUG}' (production + preview)"
    echo ""
    echo "🔄 To deploy the change, either:"
    echo "   • Push a commit to main branch (auto-deploys), OR"
    echo "   • Run: vercel --prod --token=\$VERCEL_TOKEN"
  else
    echo "❌ Failed to set ${VAR_NAME}. Response:"
    echo "$CREATE_RESP"
    exit 1
  fi
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ DONE — CRON_SECRET is configured."
echo ""
echo "The Vercel Cron job (*/5 * * * *) will now authenticate successfully"
echo "and pre-warm the dashboard cache for active admin/manager users."
echo "First dashboard load for each user will be instant instead of ~8s."
echo "════════════════════════════════════════════════════════════════"
