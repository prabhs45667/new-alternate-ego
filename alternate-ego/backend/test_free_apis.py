"""Test updated free APIs for cartoon avatar - Round 2"""
import requests
import base64
import os
import json

# Find test image
test_image_path = None
for root, dirs, files in os.walk("storage/avatars"):
    for f in files:
        if f.endswith((".jpg", ".jpeg", ".png")):
            test_image_path = os.path.join(root, f)
            break
    if test_image_path:
        break

print(f"Using: {test_image_path}")
with open(test_image_path, "rb") as f:
    img_bytes = f.read()
img_b64 = base64.b64encode(img_bytes).decode()

# ====================================================
# TEST 1: Gradio Client for HF Spaces (new API format)
# ====================================================
print("\n=== TEST 1: HF Spaces via Gradio Client API ===")
# Try cartoon style transfer spaces
spaces_to_try = [
    ("https://tonyassi-image-to-3d-cartoon.hf.space/call/predict", "Image to 3D Cartoon"),
    ("https://sameerhm-animegan-v2-for-videos.hf.space/call/predict", "AnimeGAN v2"),
]
for space_url, name in spaces_to_try:
    print(f"\n  Trying: {name}")
    try:
        # Step 1: Submit job
        submit_resp = requests.post(space_url, json={
            "data": [{"path": None, "url": f"data:image/jpeg;base64,{img_b64}"}]
        }, timeout=30)
        print(f"    Submit status: {submit_resp.status_code}")
        if submit_resp.status_code == 200:
            event_id = submit_resp.json().get("event_id")
            if event_id:
                # Step 2: Get result
                result_url = space_url.replace("/call/predict", f"/call/predict/{event_id}")
                result_resp = requests.get(result_url, timeout=120, stream=True)
                full_text = ""
                for line in result_resp.iter_lines():
                    if line:
                        full_text += line.decode() + "\n"
                print(f"    Result: {full_text[:300]}")
        else:
            print(f"    Error: {submit_resp.text[:200]}")
    except Exception as e:
        print(f"    Exception: {e}")

# ====================================================
# TEST 2: SiliconFlow (free 400/day)
# ====================================================
print("\n=== TEST 2: SiliconFlow Free API ===")
try:
    sf_url = "https://api.siliconflow.cn/v1/images/generations"
    payload = {
        "model": "stabilityai/stable-diffusion-xl-base-1.0",
        "prompt": "cute cartoon avatar portrait of a young person, disney pixar 3D style, vibrant colors, clean vector art, happy smile, digital illustration",
        "negative_prompt": "photorealistic, blurry, deformed, ugly",
        "image_size": "512x512",
        "num_inference_steps": 20
    }
    resp = requests.post(sf_url, json=payload, headers={"Content-Type": "application/json"}, timeout=60)
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"  Response: {str(data)[:300]}")
    elif resp.status_code == 401:
        print("  Needs API key (free signup at siliconflow.cn)")
        print(f"  {resp.text[:200]}")
    else:
        print(f"  Error: {resp.text[:300]}")
except Exception as e:
    print(f"  Exception: {e}")

# ====================================================
# TEST 3: Pollinations text-to-image (NO auth for GET)
# ====================================================
print("\n=== TEST 3: Pollinations Text-to-Image (no auth GET) ===")
try:
    prompt = "cute 3D cartoon avatar of a young Indian man, disney pixar style, vibrant colors, clean illustration, happy smile, digital art, studio lighting"
    poll_url = f"https://image.pollinations.ai/prompt/{requests.utils.quote(prompt)}?width=512&height=512&model=flux&nologo=true&seed=42"
    print(f"  Fetching image...")
    resp = requests.get(poll_url, timeout=120)
    print(f"  Status: {resp.status_code}")
    content_type = resp.headers.get("content-type", "")
    print(f"  Content-Type: {content_type}")
    if resp.status_code == 200 and "image" in content_type:
        with open("test_pollinations_text2img.png", "wb") as f:
            f.write(resp.content)
        print(f"  SUCCESS! Saved: test_pollinations_text2img.png ({len(resp.content)} bytes)")
    elif resp.status_code == 200:
        print(f"  Got non-image response: {resp.text[:200]}")
    else:
        print(f"  Error: {resp.text[:300]}")
except Exception as e:
    print(f"  Exception: {e}")

# ====================================================
# TEST 4: Gemini with new key - check quota reset
# ====================================================
print("\n=== TEST 4: Gemini 2.5 Flash Image (quota check) ===")
api_key = "AIzaSyBTFUd7WA_2X8LQyVC_2K1w4BWVrgJV-pU"
try:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [
            {"text": "Draw a cute cartoon avatar of this person, Disney Pixar 3D style"},
            {"inlineData": {"mimeType": "image/jpeg", "data": img_b64}}
        ]}],
        "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}
    }
    resp = requests.post(url, json=payload, timeout=90)
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            for p in parts:
                inline = p.get("inlineData") or {}
                if inline.get("data"):
                    raw = base64.b64decode(inline["data"])
                    with open("test_gemini_result.png", "wb") as f:
                        f.write(raw)
                    print(f"  SUCCESS! Gemini quota RESTORED! Saved: test_gemini_result.png")
                    break
    elif resp.status_code == 429:
        print("  Still quota exceeded")
    else:
        print(f"  Error: {resp.text[:200]}")
except Exception as e:
    print(f"  Exception: {e}")

print("\n=== ALL TESTS COMPLETE ===")
