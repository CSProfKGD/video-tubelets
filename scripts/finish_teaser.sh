#!/bin/sh
set -eu
suffix=''; duration=32; qa='.qa/teaser'
if [ "${1:-}" = '--short' ]; then suffix='-short'; duration=$(python3 -c 'import json; print(json.load(open("scripts/teaser-short.json"))["outputDuration"])'); qa='.qa/teaser-short'; fi
ffmpeg -v error -y -i "exports/teaser${suffix}-silent.mp4" -i "exports/teaser${suffix}-audio.wav" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -ar 48000 -movflags +faststart -t "$duration" "exports/video-tubelets-teaser${suffix}.mp4"
ffprobe -v error -show_entries format=duration,size:stream=codec_name,codec_type,width,height,r_frame_rate,nb_frames,sample_rate,channels,duration -of json "exports/video-tubelets-teaser${suffix}.mp4" > "$qa/encoded.json"
ffmpeg -v error -i "exports/video-tubelets-teaser${suffix}.mp4" -f null -
