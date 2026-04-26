"""Test: Upload photo to free host, then use Pollinations kontext (image-to-image)."""
import requests
import base64
import os
import urllib.parse

# Load test image
test_image_path = None
for root, dirs, files in os.walk("storage/avatars"):
    for f in files:
        if f == "original.jpg" or f.endswith(".jpg"):
            test_image_path = os.path.join(root, f)
            break
    if test_image_path:
        break

print(f"Using: {test_image_path}")
with open(test_image_path, "rb") as f:
    img_bytes = f.read()

# ============================================
# Step 1: Upload to free temporary image host
# ============================================
print("\n=== Uploading to free image host... ===")
img_url = None

# Try 0x0.st (free, no signup)
try:
    print("  Trying 0x0.st...")
    resp = requests.post("https://0x0.st", files={"file": ("photo.jpg", img_bytes, "image/jpeg")}, timeout=30)
    if resp.status_code == 200 and resp.text.strip().startswith("http"):
        img_url = resp.text.strip()
        print(f"  SUCCESS: {img_url}")
except Exception as e:
    print(f"  0x0.st failed: {e}")

# Fallback: try litterbox.catbox.moe (free, temp files)
if not img_url:
    try:
        print("  Trying litterbox.catbox.moe...")
        resp = requests.post("https://litterbox.catbox.moe/resources/internals/api.php",
            data={"reqtype": "fileupload", "time": "1h"},
            files={"fileToUpload": ("photo.jpg", img_bytes, "image/jpeg")},
            timeout=30)
        if resp.status_code == 200 and resp.text.strip().startswith("http"):
            img_url = resp.text.strip()
            print(f"  SUCCESS: {img_url}")
    except Exception as e:
        print(f"  litterbox failed: {e}")

# Fallback: try catbox.moe (permanent)
if not img_url:
    try:
        print("  Trying catbox.moe...")
        resp = requests.post("https://catbox.moe/user/api.php",
            data={"reqtype": "fileupload", "userhash": ""},
            files={"fileToUpload": ("photo.jpg", img_bytes, "image/jpeg")},
            timeout=30)
        if resp.status_code == 200 and resp.text.strip().startswith("http"):
            img_url = resp.text.strip()
            print(f"  SUCCESS: {img_url}")
    except Exception as e:
        print(f"  catbox failed: {e}")

if not img_url:
    print("  ALL upload hosts failed. Using text-only approach.")
else:
    print(f"\nPhoto URL: {img_url}")
    
    # ============================================
    # Step 2: Use Pollinations kontext with image URL
    # ============================================
    models_to_try = ["kontext", "klein"]
    
    for model in models_to_try:
        print(f"\n=== Testing {model} model with image URL ===")
        prompt = "Transform this exact person into a 3D Disney Pixar cartoon avatar. Keep the SAME gender, SAME face shape, SAME hair style, SAME skin tone. Make it look like THIS specific person but in cartoon style. Happy smile expression."
        
        url = (
            f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt)}"
            f"?model={model}&width=512&height=512&nologo=true"
            f"&image={urllib.parse.quote(img_url)}"
        )
        
        try:
            resp = requests.get(url, timeout=120)
            print(f"  Status: {resp.status_code}")
            ct = resp.headers.get("content-type", "")
            print(f"  Content-Type: {ct}")
            if resp.status_code == 200 and "image" in ct:
                fname = f"test_{model}_result.png"
                with open(fname, "wb") as f:
                    f.write(resp.content)
                print(f"  SUCCESS! Saved {fname} ({len(resp.content)} bytes)")
            elif resp.status_code == 401:
                print(f"  Needs API key (paid model)")
            elif resp.status_code == 402:
                print(f"  Needs pollen credits (paid)")
            else:
                body = resp.text[:300] if resp.text else "(empty)"
                print(f"  Error: {body}")
        except Exception as e:
            print(f"  Exception: {e}")

print("\n=== DONE ===")
