#!/usr/bin/env bash
# Kiểm tra banner hero đủ độ phân giải cho full-width (cần ~3840px rộng).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/assets/home"
MIN_WIDTH=3000
FAIL=0

echo "Kiểm tra hero assets trong: $ASSETS"
echo "Yêu cầu tối thiểu: ${MIN_WIDTH}px chiều rộng (khuyến nghị 3840×1440)"
echo ""

for f in "$ASSETS"/hero-*-3840w.png; do
  [ -f "$f" ] || continue
  w=$(sips -g pixelWidth "$f" 2>/dev/null | awk '/pixelWidth:/{print $2}')
  h=$(sips -g pixelHeight "$f" 2>/dev/null | awk '/pixelHeight:/{print $2}')
  if [ -z "$w" ] || [ "$w" -lt "$MIN_WIDTH" ]; then
    echo "❌ $(basename "$f"): ${w:-?}×${h:-?} — QUÁ NHỎ, banner sẽ mờ trên màn full HD/Retina"
    FAIL=1
  else
    echo "✓ $(basename "$f"): ${w}×${h}"
  fi
done

if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "Cách sửa: Export 3840×1440 từ thiết kế, kéo thả GHI ĐÈ (không gửi qua chat):"
  echo "  hero-bao-tin-manh-hai-3840w.png"
  echo "  hero-bao-tin-minh-chau-3840w.png"
  echo "  hero-tich-san-vang-3840w.png"
  exit 1
fi

echo ""
echo "Tất cả file hero đạt độ phân giải."
