#!/data/data/com.termux/files/usr/bin/bash
#
# setup.sh - Termux/Android bootstrap for the VyRobot Prediction Engine.
#
# Installs the system toolchain (python, clang, openssl, git, build tools,
# rust/cmake for compiling native wheels like coincurve/cryptography) and
# every Python dependency the engine needs, then creates a Python virtual
# environment under ./venv.
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh
#
set -euo pipefail

log() {
    printf '\n\033[1;32m[setup]\033[0m %s\n' "$1"
}

warn() {
    printf '\n\033[1;33m[setup][warn]\033[0m %s\n' "$1"
}

fail() {
    printf '\n\033[1;31m[setup][error]\033[0m %s\n' "$1" >&2
    exit 1
}

if [ -z "${PREFIX:-}" ] || [ ! -d "${PREFIX:-/nonexistent}" ]; then
    warn "This does not look like a Termux environment (\$PREFIX is unset)."
    warn "Continuing anyway, but package installation steps may fail on non-Termux Linux."
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log "Requesting Termux storage permission (safe to deny if you don't need file access)..."
command -v termux-setup-storage >/dev/null 2>&1 && termux-setup-storage || true

log "Updating Termux package index..."
pkg update -y || fail "pkg update failed. Check your network connection and Termux mirror."

log "Upgrading existing packages..."
pkg upgrade -y || warn "pkg upgrade reported issues; continuing."

# Core toolchain requested explicitly: python, clang, openssl, git, build-essential.
# We additionally pull rust/cmake/libsecp256k1/pkg-config/libffi because web3.py's
# transitive dependency chain (coincurve -> libsecp256k1, cryptography -> openssl/rust)
# will fail to build native wheels on Termux without them.
CORE_PACKAGES=(
    python
    python-pip
    clang
    make
    binutils
    openssl
    openssl-tool
    git
    build-essential
    rust
    cmake
    pkg-config
    libffi
    libjpeg-turbo
    libsecp256k1
)

for pkg_name in "${CORE_PACKAGES[@]}"; do
    log "Installing package: ${pkg_name}"
    if ! pkg install -y "$pkg_name"; then
        warn "Package '${pkg_name}' failed to install or is unavailable on this Termux repo snapshot."
        warn "Continuing; pip installs below may still succeed if this package is not strictly required."
    fi
done

command -v python3 >/dev/null 2>&1 || fail "python3 is not on PATH after installation; aborting."
command -v git >/dev/null 2>&1 || fail "git is not on PATH after installation; aborting."

log "Using $(python3 --version) at $(command -v python3)"

# Environment variables that materially help native-extension builds on Termux/aarch64.
export CARGO_NET_GIT_FETCH_WITH_CLI=true
export CFLAGS="-O2 -fPIC ${CFLAGS:-}"
export LDFLAGS="-L${PREFIX}/lib ${LDFLAGS:-}"
export CPPFLAGS="-I${PREFIX}/include ${CPPFLAGS:-}"

VENV_DIR="$SCRIPT_DIR/venv"
if [ ! -d "$VENV_DIR" ]; then
    log "Creating Python virtual environment at ${VENV_DIR}..."
    python3 -m venv "$VENV_DIR" || fail "Failed to create virtual environment."
else
    log "Virtual environment already exists at ${VENV_DIR}; reusing it."
fi

# shellcheck disable=SC1090
source "$VENV_DIR/bin/activate"

log "Upgrading pip/setuptools/wheel inside the virtual environment..."
pip install --upgrade pip setuptools wheel || fail "Failed to upgrade pip toolchain."

log "Installing Python dependencies (this can take several minutes on-device)..."
pip install --no-cache-dir \
    aiohttp==3.10.11 \
    websockets==13.1 \
    web3==6.20.3 \
    eth-account==0.13.4 \
    cryptography==43.0.3 \
    python-dotenv==1.0.1 \
    requests==2.32.3 \
    || fail "pip install failed. Re-run with 'pip install -v <pkg>' on the failing package to inspect the build log."

log "Verifying critical imports..."
python3 - <<'PYEOF'
import importlib
mods = ["aiohttp", "websockets", "web3", "eth_account", "cryptography", "dotenv"]
for m in mods:
    importlib.import_module(m)
    print(f"  OK: {m}")
PYEOF

if [ ! -f "$SCRIPT_DIR/.env" ] && [ -f "$SCRIPT_DIR/.env.example" ]; then
    log "No .env found; copying .env.example -> .env (edit this before going live)."
    cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
fi

log "Acquiring a Termux wake-lock so Android does not suspend the process in the background."
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || warn "termux-wake-lock not found (install 'termux-api' package + Termux:API app for this)."

log "Setup complete."
cat <<'EOF'

Next steps:
  1. Edit vyrobot/.env with your API keys and wallet credentials.
  2. Edit vyrobot/markets.json with the markets you want to watch.
  3. Activate the environment in future sessions with:
         source venv/bin/activate
  4. Dry-run the engine (no real orders, the default):
         python main.py
  5. Go live only once you have verified behaviour in dry-run:
         python main.py --live

EOF
