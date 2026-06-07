#!/usr/bin/env bash
# Script de déploiement Topissimo :
# 1. Bump auto de la version du Service Worker (garenna-vN → garenna-v(N+1))
# 2. Commit du bump
# 3. Merge dev → main et push
# 4. Retour sur dev
#
# Usage : ./deploy.sh "message du commit"
set -e

cd "$(dirname "$0")"

MSG="${1:-Déploiement}"
SW_FILE="topissimo/sw.js"

# Lire l'ancienne version
OLD=$(grep -oE 'garenna-v[0-9]+' "$SW_FILE" | head -1)
N=${OLD#garenna-v}
NEW="garenna-v$((N + 1))"

# Bumper
sed -i.bak "s/$OLD/$NEW/g" "$SW_FILE"
rm "$SW_FILE.bak"

echo "📦 SW: $OLD → $NEW"

# Commit le bump (sur dev)
git add "$SW_FILE"
git commit -q -m "Bump SW $NEW" --allow-empty || true

# Merge dev → main + push
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "dev" ]; then
  echo "⚠️  Pas sur dev (sur $CURRENT_BRANCH). Annulation."
  exit 1
fi

git checkout main
git merge dev --no-edit
git push origin main
git checkout dev

echo "✅ Déployé sur main ($NEW) — $MSG"
