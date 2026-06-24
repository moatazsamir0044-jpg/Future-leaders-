#!/bin/bash
# Auto-install gstack from bundled zip at session start.
# Runs as a SessionStart hook so gstack is always ready in fresh containers.

GSTACK_DIR="$HOME/.claude/skills/gstack"
SKILLS_DIR="$HOME/.claude/skills"
REPO_DIR="$(dirname "$(dirname "$(dirname "$0")")")"
ZIP="$REPO_DIR/gstack-main 2.zip"

# Already installed — skip
if [ -d "$GSTACK_DIR/bin" ] && [ -f "$SKILLS_DIR/review/SKILL.md" ]; then
  exit 0
fi

# Ensure zip exists
if [ ! -f "$ZIP" ]; then
  echo "[gstack] Warning: gstack-main 2.zip not found at $REPO_DIR — skipping install" >&2
  exit 0
fi

echo "[gstack] Installing gstack from bundled zip..." >&2

# Extract zip to a temp location then move into place
TMP="$(mktemp -d)"
unzip -q "$ZIP" -d "$TMP" 2>/dev/null

if [ ! -d "$TMP/gstack-main" ]; then
  echo "[gstack] Error: extraction failed" >&2
  rm -rf "$TMP"
  exit 0
fi

# Install to skills dir (replace any stale copy)
rm -rf "$GSTACK_DIR"
mkdir -p "$SKILLS_DIR"
mv "$TMP/gstack-main" "$GSTACK_DIR"
rm -rf "$TMP"

# Build browse binary and generate skill docs
cd "$GSTACK_DIR"
bun install --frozen-lockfile 2>/dev/null || bun install --silent 2>/dev/null
GSTACK_SKIP_FONTS=1 bun run build --silent 2>/dev/null || true

# Create gstack state dir
mkdir -p "$HOME/.gstack/projects"

# Link individual skill dirs (flat names, no prefix)
for skill_dir in "$GSTACK_DIR"/*/; do
  if [ -f "$skill_dir/SKILL.md" ]; then
    dir_name="$(basename "$skill_dir")"
    [ "$dir_name" = "node_modules" ] && continue
    skill_name=$(grep -m1 '^name:' "$skill_dir/SKILL.md" 2>/dev/null | sed 's/^name:[[:space:]]*//' | tr -d '[:space:]')
    [ -z "$skill_name" ] && skill_name="$dir_name"
    target="$SKILLS_DIR/$skill_name"
    [ -L "$target" ] && rm -f "$target"
    mkdir -p "$target"
    [ -L "$target/SKILL.md" ] && rm -f "$target/SKILL.md"
    ln -snf "$GSTACK_DIR/$dir_name/SKILL.md" "$target/SKILL.md"
    if [ -d "$GSTACK_DIR/$dir_name/sections" ]; then
      [ -e "$target/sections" ] && rm -rf "$target/sections"
      ln -snf "$GSTACK_DIR/$dir_name/sections" "$target/sections"
    fi
  fi
done

# Link root gstack alias
target="$SKILLS_DIR/_gstack-command"
[ -L "$target" ] && rm -f "$target"
mkdir -p "$target"
[ -L "$target/SKILL.md" ] && rm -f "$target/SKILL.md"
ln -snf "$GSTACK_DIR/SKILL.md" "$target/SKILL.md"

echo "[gstack] Installed successfully — $(ls "$SKILLS_DIR" | wc -l) skills ready" >&2
