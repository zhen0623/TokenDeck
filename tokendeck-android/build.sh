#!/usr/bin/env bash
# 一键构建：注入便携 JDK / Android SDK 后调用 Gradle
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export JAVA_HOME="$ROOT/tools/jdk"
export ANDROID_HOME="$ROOT/tools/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
cd "$ROOT"
exec "$ROOT/gradlew" "$@"
