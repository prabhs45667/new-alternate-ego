"""Test new Gemini API key with all image generation models."""
import requests
import base64
import os
import io

API_KEY = "AIzaSyBTFUd7WA_2X8LQyVC_2K1w4BWVrgJV-pU"

test_image_path = None
avatars_dir = "storage/avatars"
for root, dirs, files in os.walk(avatars_dir):
    for f in files:
        if f.endswith((".jpg", ".jpeg", ".png")):
            test_image_path = os.path.join(root, f)
            break
    if test_image_path:
        break

if not test_image_path:
    from PIL import Image
    img = Image.new("RGB", (64, 64), color=(200, 150, 100))
    test_image_path = "test_dummy.jpg"
    img.save(test_image_path)

print(f"Using image: {test_image_path}")
with open(test_image_path, "rb") as f:
    img_bytes = f.read()

img_b64 = base64.b64encode(img_bytes).decode("utf-8")
mime_type = "image/png" if test_image_path.endswith(".png") else "image/jpeg"

IMAGE_MODELS = [
    "gemini-2.5-flash-image",
    "gemini-3-pro-image-preview",
    "gemini-3.1-flash-image-preview",
]

working_model = None
for model in IMAGE_MODELS:
    print(f"\nTesting: {model}")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}"
    payload = {
        "contents": [{
            "parts": [
                {"text": "Draw a simple cartoon avatar of this person with a big happy smile. Output image only."},
                {"inlineData": {"mimeType": mime_type, "data": img_b64}}
            ]
        }],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"]
        }
    }
    try:
        resp = requests.post(url, json=payload, timeout=90)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            candidates = data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                for p in parts:
                    inline = p.get("inlineData") or p.get("inline_data") or {}
                    img_data = inline.get("data") if isinstance(inline, dict) else None
                    if img_data:
                        print(f"  *** SUCCESS with {model}! ***")
                        from PIL import Image
                        raw = base64.b64decode(img_data)
                        img = Image.open(io.BytesIO(raw))
                        img.save(f"test_result.png", "PNG")
                        print(f"  Saved test_result.png ({img.size})")
                        working_model = model
                        break
                if working_model:
                    break
        elif resp.status_code == 429:
            print(f"  QUOTA EXCEEDED on this key too")
        elif resp.status_code == 400:
            err = resp.json().get("error", {}).get("message", "")[:200]
            print(f"  Bad request: {err}")
        else:
            print(f"  Error: {resp.text[:300]}")
    except Exception as e:
        print(f"  Exception: {e}")

if working_model:
    print(f"\nBest model to use: {working_model}")
else:
    print("\nNo working model found. All quota exceeded or not supported.")
