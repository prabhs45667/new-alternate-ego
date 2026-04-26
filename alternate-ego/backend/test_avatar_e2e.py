"""Full E2E test: Generate all 4 emotion avatars with Klein img2img."""
import sys, os
sys.path.insert(0, ".")

# Find twin with original photo
test_twin_id = None
avatars_dir = "storage/avatars"
if os.path.exists(avatars_dir):
    for d in os.listdir(avatars_dir):
        dp = os.path.join(avatars_dir, d)
        if os.path.isdir(dp):
            # Ensure original.jpg exists
            orig = os.path.join(dp, "original.jpg")
            if os.path.exists(orig):
                test_twin_id = d
                break
            # Copy any jpg as original
            for f in os.listdir(dp):
                if f.endswith(".jpg") and f != "original.jpg":
                    import shutil
                    shutil.copy2(os.path.join(dp, f), orig)
                    test_twin_id = d
                    break
        if test_twin_id:
            break

if not test_twin_id:
    print("No twin found!")
    sys.exit(1)

# Delete old avatars to force fresh generation
for emotion in ["neutral", "happy", "sad", "angry"]:
    old = os.path.join(avatars_dir, test_twin_id, f"{emotion}_avatar.png")
    if os.path.exists(old):
        os.remove(old)
        print(f"Deleted old: {old}")

print(f"\nTwin: {test_twin_id}")
print(f"Photo: storage/avatars/{test_twin_id}/original.jpg")
print("\nGenerating 4 emotion avatars via Klein img2img...")
print("(~60-90 seconds total)\n")

from avatar.avatar_generator import generate_all_emotion_avatars
import time
start = time.time()
results = generate_all_emotion_avatars(test_twin_id)
elapsed = time.time() - start

print(f"\n{'='*50}")
print(f"Results: {len(results)}/4 avatars in {elapsed:.1f}s")
print(f"{'='*50}")
for emotion, path in results.items():
    exists = os.path.exists(path)
    size = os.path.getsize(path) if exists else 0
    print(f"  {emotion:8s}: {'✓ OK' if exists else '✗ MISSING'} ({size:,} bytes)")

if len(results) >= 4:
    print("\n🎉 ALL AVATARS GENERATED SUCCESSFULLY!")
elif len(results) >= 2:
    print("\n⚠️ Partial success. Some avatars may need retry.")
else:
    print("\n❌ Generation failed. Check logs.")
