#!/usr/bin/env bash
#
# Import the badminton and cricket photos into the site.
#
#   ./tools/add-hobby-photos.sh <badminton-photo> <cricket-photo>
#
# Accepts .heic / .jpg / .jpeg / .png at any size or orientation. Applies EXIF
# rotation, crops to the tile's aspect ratio around the subject, resizes for the
# web, strips metadata, and writes:
#
#   assets/img/hobby-badminton.jpg   (portrait tile, 3:4.6)
#   assets/img/hobby-cricket.jpg     (landscape tile, 4:3)
#
# Update just one:
#   ./tools/add-hobby-photos.sh --cricket ~/Desktop/match.jpg
#
# The crop is nudged toward where the subject sits in each shot. If the framing
# comes out wrong for a different photo, change FOCUS_X / FOCUS_Y below
# (0 = left/top, 1 = right/bottom) and run it again.
#
set -euo pipefail
cd "$(dirname "$0")/.."

TMPFILES=""
cleanup() { [ -n "$TMPFILES" ] && rm -f $TMPFILES || true; }
trap cleanup EXIT

# slug          aspect  width  focus-x  focus-y  zoom
BADMINTON=("badminton" "0.652" "1200" "0.57" "0.57" "0.96")
CRICKET=("cricket"   "1.333" "1600" "0.58" "0.47" "0.62")

usage() {
  echo "usage: $0 <badminton-photo> <cricket-photo>"
  echo "       $0 --badminton <photo>"
  echo "       $0 --cricket <photo>"
  exit 1
}

convert_one() {
  local src="$1"; shift
  local slug="$1" aspect="$2" width="$3" fx="$4" fy="$5" zoom="$6"
  [ -f "$src" ] || { echo "✗ not found: $src" >&2; exit 1; }

  # Pillow can't decode HEIC/HEIF, so hand those to macOS sips first
  case "$(printf '%s' "$src" | tr '[:upper:]' '[:lower:]')" in
    *.heic|*.heif)
      local tmp; tmp="$(mktemp -t hobbyphoto).jpg"
      sips -s format jpeg "$src" --out "$tmp" >/dev/null
      TMPFILES="$TMPFILES $tmp"
      src="$tmp"
      ;;
  esac

  python3 - "$src" "assets/img/hobby-${slug}.jpg" "$aspect" "$width" "$fx" "$fy" "$zoom" <<'PY'
import sys
from PIL import Image, ImageOps

src, out, aspect, width, fx, fy, zoom = sys.argv[1:8]
aspect, width, fx, fy, zoom = float(aspect), int(width), float(fx), float(fy), float(zoom)

im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")   # honour EXIF rotation
W, H = im.size

# largest box of the target aspect that fits, scaled down by `zoom` to tighten in
if W / H > aspect:
    ch = H * zoom; cw = ch * aspect
else:
    cw = W * zoom; ch = cw / aspect

# centre it on the focal point, then push it back inside the frame
left = min(max(fx * W - cw / 2, 0), W - cw)
top  = min(max(fy * H - ch / 2, 0), H - ch)
im = im.crop((round(left), round(top), round(left + cw), round(top + ch)))

if im.width > width:
    im.thumbnail((width, width * 10), Image.LANCZOS)

im.save(out, "JPEG", quality=84, optimize=True, progressive=True)  # re-encode drops metadata
print(f"  {W}x{H} -> {im.size[0]}x{im.size[1]}")
PY
  echo "✓ assets/img/hobby-${slug}.jpg"
}

case "${1:-}" in
  --badminton) [ $# -eq 2 ] || usage; convert_one "$2" "${BADMINTON[@]}" ;;
  --cricket)   [ $# -eq 2 ] || usage; convert_one "$2" "${CRICKET[@]}" ;;
  -h|--help|"") usage ;;
  *)
    [ $# -eq 2 ] || usage
    convert_one "$1" "${BADMINTON[@]}"
    convert_one "$2" "${CRICKET[@]}"
    ;;
esac

echo
echo "Reload http://localhost:5199 — the placeholders are gone."
