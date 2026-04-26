"""Test correct Gemini model names for image generation."""
import requests

API_KEY = "AIzaSyDnEK-lNUtbn-VKV_i-ruMb1gC-EdHKBPg"

# List available models
print("Fetching available models...")
url = f"https://generativelanguage.googleapis.com/v1beta/models?key={API_KEY}"
resp = requests.get(url, timeout=30)
print(f"Status: {resp.status_code}")
if resp.status_code == 200:
    data = resp.json()
    models = data.get("models", [])
    image_models = []
    flash_models = []
    for m in models:
        name = m.get("name", "")
        methods = m.get("supportedGenerationMethods", [])
        display = m.get("displayName", "")
        if "image" in name.lower() or "imagen" in name.lower():
            image_models.append(f"  {name} | methods: {methods}")
        if "flash" in name.lower() or "pro" in name.lower():
            flash_models.append(f"  {name} | {display} | methods: {methods}")
    print(f"\nTotal models: {len(models)}")
    print("\nImage-related models:")
    for m in image_models:
        print(m)
    print("\nFlash/Pro models:")
    for m in flash_models[:20]:
        print(m)
else:
    print(f"ERROR: {resp.text[:500]}")
