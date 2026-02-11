#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./release.sh <sepolia|mainnet>

Runs the release flow for the selected target.
EOF
}

if [ "${1:-}" = "" ]; then
  usage
  exit 1
fi

TARGET="$1"

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is not clean. Commit or stash changes before releasing."
  exit 1
fi

confirm_versions() {
  local changed_packages=()
  while IFS= read -r pkg_file; do
    changed_packages+=("$pkg_file")
  done < <(git diff --name-only --diff-filter=M -- '**/package.json')

  echo "Updated package versions:"
  if [ ${#changed_packages[@]} -eq 0 ]; then
    echo "(no package.json changes detected)"
  else
    for pkg_file in "${changed_packages[@]}"; do
      node -e "const pkg=require(process.argv[1]); if (pkg.name && pkg.version) console.log(pkg.name + ': ' + pkg.version)" "./${pkg_file}"
    done
  fi
  echo
  read -r -p "Proceed with build/publish? (y/N) " CONFIRM
  if [ "${CONFIRM}" != "y" ] && [ "${CONFIRM}" != "Y" ]; then
    echo "Release cancelled."
    exit 1
  fi
}

commit_release() {
  if [ -z "$(git status --porcelain)" ]; then
    echo "No changes to commit."
    return
  fi

  local frontend_version
  frontend_version=$(node -p "require('./frontend/package.json').version")

  git add -A
  git commit -m "Release v${frontend_version}"
}

set_chain_id() {
  local chain_id="$1"
  local env_file="frontend/.env"

  if [ -f "$env_file" ]; then
    if grep -q "^CHAIN_ID=" "$env_file"; then
      sed -i '' "s/^CHAIN_ID=.*/CHAIN_ID=${chain_id}/" "$env_file"
    else
      echo "CHAIN_ID=${chain_id}" >> "$env_file"
    fi
  else
    echo "CHAIN_ID=${chain_id}" > "$env_file"
  fi
}

case "$TARGET" in
  sepolia)
    set_chain_id "11155111"
    if [ -f ".changeset/pre.json" ]; then
      echo "Prerelease mode already active; skipping pre enter."
    else
      pnpm changeset pre enter rc
    fi

    pnpm changeset version
    pnpm install
    confirm_versions
    commit_release
    pnpm run build
    pnpm changeset publish
    pnpm --filter @simplepg/frontend run stage-sepolia
    ;;
  mainnet)
    set_chain_id "1"
    if [ -f ".changeset/pre.json" ]; then
      pnpm changeset pre exit
    fi
    pnpm changeset version
    pnpm install
    confirm_versions
    commit_release
    pnpm run build
    pnpm changeset publish
    pnpm --filter @simplepg/frontend run stage
    ;;
  *)
    usage
    exit 1
    ;;
esac
