#!/usr/bin/env bash
# Generates synthetic HLS demo assets with 2.5 s segments and keyframes forced on segment
# boundaries (guide §2.4). A burnt-in clock makes seek and chunk accounting verifiable by eye.
set -euo pipefail
cd "$(dirname "$0")/.."
FFMPEG="${FFMPEG:-ffmpeg}"

make_asset() {
  local id="$1" dur="$2" hue="$3"
  local out="public/demo/$id"
  mkdir -p "$out"
  "$FFMPEG" -y -loglevel error \
    -f lavfi -i "testsrc=size=1280x720:rate=30" \
    -f lavfi -i "sine=frequency=440:sample_rate=48000" \
    -t "$dur" \
    -vf "hue=h=${hue}" \
    -c:v libx264 -preset veryfast -profile:v main -pix_fmt yuv420p -sc_threshold 0 \
    -force_key_frames "expr:gte(t,n_forced*2.5)" \
    -c:a aac -b:a 96k \
    -f hls -hls_time 2.5 -hls_playlist_type vod -hls_flags independent_segments \
    -hls_segment_filename "$out/seg-%04d.ts" "$out/index.m3u8"
  "$FFMPEG" -y -loglevel error -f lavfi -i "testsrc=size=640x360:rate=1" -vf "hue=h=${hue},format=yuvj420p" -frames:v 1 -q:v 3 "$out/thumb.jpg"
  local segs
  segs=$(ls "$out"/seg-*.ts | wc -l | tr -d ' ')
  echo "$id: ${dur}s -> $segs segments"
  # Every EXTINF except the last must be 2.5 s.
  if grep -E '^#EXTINF:' "$out/index.m3u8" | sed '$d' | grep -qv '^#EXTINF:2\.5'; then
    echo "WARNING: $id has segments that are not 2.5 s" >&2
    grep -E '^#EXTINF:' "$out/index.m3u8" | sort | uniq -c >&2
  fi
}

make_asset d30 30 0
make_asset d60 60 90
make_asset d120 120 180
make_asset d300 300 270
