#!/usr/bin/env python3
"""Generate or edit an infographic image via Gemini API direct call.

Usage:
    # Text-to-image (generate new)
    python3 generate_infographic.py --prompt "Your prompt" --output output.png

    # Image editing (edit existing image with prompt)
    python3 generate_infographic.py --input-image source.png --prompt "Edit instructions" --output output.png

    # Read prompt from file
    python3 generate_infographic.py --prompt-file prompt.txt --output output.png
    python3 generate_infographic.py --input-image source.png --prompt-file prompt.txt --output output.png

    # Model and count options
    python3 generate_infographic.py --prompt "..." --output output.png --model gemini-3-pro-image-preview
    python3 generate_infographic.py --prompt "..." --output output.png --count 3

Environment:
    Requires one of: GEMINI_API_KEY, GOOGLE_API_KEY, NANOBANANA_GEMINI_API_KEY
"""

import argparse
import base64
import json
import mimetypes
import os
import sys
import urllib.request
import urllib.error

DEFAULT_MODEL = "gemini-2.5-flash-image"
API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


def get_api_key():
    for key_name in ["GEMINI_API_KEY", "GOOGLE_API_KEY", "NANOBANANA_GEMINI_API_KEY"]:
        key = os.environ.get(key_name)
        if key:
            return key
    print("ERROR: No API key found. Set GEMINI_API_KEY, GOOGLE_API_KEY, or NANOBANANA_GEMINI_API_KEY.", file=sys.stderr)
    sys.exit(1)


def load_image_as_base64(image_path):
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def get_mime_type(image_path):
    mime, _ = mimetypes.guess_type(image_path)
    return mime or "image/png"


def generate_image(prompt, model, api_key, input_image_path=None):
    url = f"{API_BASE}/{model}:generateContent?key={api_key}"

    parts = []
    if input_image_path:
        img_b64 = load_image_as_base64(input_image_path)
        mime = get_mime_type(input_image_path)
        parts.append({"inlineData": {"mimeType": mime, "data": img_b64}})
    parts.append({"text": prompt})

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"ERROR: API returned {e.code}: {body}", file=sys.stderr)
        sys.exit(1)


def extract_and_save(data, output_path, index=None):
    parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    saved = []
    img_idx = 0
    for p in parts:
        if "inlineData" in p:
            img_bytes = base64.b64decode(p["inlineData"]["data"])
            if index is not None:
                base, ext = os.path.splitext(output_path)
                path = f"{base}_{index}_{img_idx}{ext}"
            elif img_idx > 0:
                base, ext = os.path.splitext(output_path)
                path = f"{base}_{img_idx}{ext}"
            else:
                path = output_path
            os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
            with open(path, "wb") as f:
                f.write(img_bytes)
            saved.append(path)
            print(f"Saved: {path} ({len(img_bytes)} bytes)")
            img_idx += 1
        elif "text" in p:
            print(f"Model response: {p['text'][:200]}")
    return saved


def main():
    parser = argparse.ArgumentParser(description="Generate or edit infographic via Gemini API")
    parser.add_argument("--prompt", type=str, help="Image generation/editing prompt text")
    parser.add_argument("--prompt-file", type=str, help="File containing the prompt text")
    parser.add_argument("--input-image", type=str, help="Source image for editing mode (image + text prompt)")
    parser.add_argument("--output", type=str, default="nanobanana-output/infographic.png", help="Output file path")
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL, help=f"Gemini model (default: {DEFAULT_MODEL})")
    parser.add_argument("--count", type=int, default=1, help="Number of variations to generate (1-8)")
    args = parser.parse_args()

    if args.prompt_file:
        with open(args.prompt_file) as f:
            prompt = f.read().strip()
    elif args.prompt:
        prompt = args.prompt
    else:
        print("ERROR: Provide --prompt or --prompt-file", file=sys.stderr)
        sys.exit(1)

    if args.input_image and not os.path.exists(args.input_image):
        print(f"ERROR: Input image not found: {args.input_image}", file=sys.stderr)
        sys.exit(1)

    mode = "editing" if args.input_image else "generating"
    api_key = get_api_key()
    count = max(1, min(8, args.count))

    all_saved = []
    for i in range(count):
        print(f"{mode.capitalize()} image {i + 1}/{count}...")
        data = generate_image(prompt, args.model, api_key, args.input_image)
        idx = i if count > 1 else None
        saved = extract_and_save(data, args.output, index=idx)
        all_saved.extend(saved)

    if all_saved:
        print(f"\nDone. {len(all_saved)} image(s) {mode.replace('ing', 'ed')}:")
        for p in all_saved:
            print(f"  {p}")
    else:
        print("ERROR: No images were generated.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
