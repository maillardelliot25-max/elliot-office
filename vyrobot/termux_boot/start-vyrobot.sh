#!/data/data/com.termux/files/usr/bin/bash
#
# Termux:Boot entry point. Install the separate "Termux:Boot" app (F-Droid
# or the same source as Termux itself), grant it permission to run at
# device boot, then copy this file to ~/.termux/boot/start-vyrobot.sh:
#
#   mkdir -p ~/.termux/boot
#   cp vyrobot/termux_boot/start-vyrobot.sh ~/.termux/boot/start-vyrobot.sh
#   chmod +x ~/.termux/boot/start-vyrobot.sh
#
# Edit VYROBOT_DIR below if you cloned the repo somewhere other than
# ~/vyrobot-checkout/vyrobot. After a phone reboot, Termux:Boot will launch
# this script automatically, which starts the crash-resilient supervisor
# (run_forever.sh) so the engine comes back up without you opening Termux.
#
set -uo pipefail

VYROBOT_DIR="$HOME/vyrobot-checkout/vyrobot"

termux-wake-lock

cd "$VYROBOT_DIR" || exit 1
nohup ./run_forever.sh >> "$VYROBOT_DIR/vyrobot_boot.log" 2>&1 &
