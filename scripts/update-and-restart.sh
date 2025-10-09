#!/usr/bin/env bash

set -euo pipefail

branch="main"
install_deps=false
skip_build=false

usage() {
  cat <<'EOF'
Usage: update-and-restart.sh [options]

Options:
  -b, --branch <name>   Branch to pull (default: main)
      --install         Run npm install after pulling
      --skip-build      Skip npm run build
  -h, --help            Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -b|--branch)
      branch="${2:-}"
      if [[ -z "$branch" ]]; then
        echo "Error: --branch requires a value." >&2
        exit 1
      fi
      shift 2
      ;;
    --install)
      install_deps=true
      shift
      ;;
    --skip-build)
      skip_build=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
cd "$repo_root"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash changes before running the update." >&2
  exit 1
fi

echo
echo "==> Fetching latest code"
git fetch origin
git checkout "$branch"
git pull origin "$branch"

if [[ "$install_deps" == true ]]; then
  echo
  echo "==> Installing dependencies"
  npm install
fi

if [[ "$skip_build" == true ]]; then
  echo "Skipping build step as requested."
else
  echo
  echo "==> Building project"
  npm run build
fi

echo
echo "==> Restarting PM2 service"
pm2 startOrReload ecosystem.config.json --only file-converter-service --update-env

echo
echo "==> PM2 status"
pm2 list | grep -i "file-converter-service" || true

echo
echo "Update complete."
