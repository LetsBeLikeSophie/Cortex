#!/usr/bin/env bash
# Builds the Play Store bundle and files it under releases/aab/ with its
# version in the name, e.g. releases/aab/cortex-1.0.0-vc1.aab.
#   bash mobile/scripts/build-aab.sh
# Before each new upload, raise expo.android.versionCode in mobile/app.json
# (Play rejects a versionCode it has already seen), then run
# `npx expo prebuild --platform android` so android/ picks it up.
set -euo pipefail

MOBILE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$MOBILE/.." && pwd)"
OUT="$ROOT/releases/aab"

# tr: Windows Python prints CRLF, and the CR would end up in the file name.
read -r VERSION VERSION_CODE < <(python -c "import json,sys; e=json.load(open(sys.argv[1],encoding='utf-8'))['expo']; print(e['version'], e['android']['versionCode'])" "$MOBILE/app.json" | tr -d '\r')
TARGET="$OUT/cortex-$VERSION-vc$VERSION_CODE.aab"
if [ -e "$TARGET" ]; then
  echo "$TARGET already exists -- raise android.versionCode in app.json first." >&2
  exit 1
fi

cd "$MOBILE/android"
# `expo prebuild --clean` regenerates android/ and drops local.properties
# (the SDK path Gradle needs) -- put it back if it's gone.
if [ ! -f local.properties ]; then
  SDK="${ANDROID_HOME:-$HOME/AppData/Local/Android/Sdk}"
  echo "sdk.dir=$(cygpath -m "$SDK" 2>/dev/null || echo "$SDK")" > local.properties
fi
./gradlew bundleRelease -q
mkdir -p "$OUT"
cp app/build/outputs/bundle/release/app-release.aab "$TARGET"
echo "$TARGET"
