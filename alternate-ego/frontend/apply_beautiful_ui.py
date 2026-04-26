import re

filepath = r"c:\Users\hp\Downloads\Alternate-ego\alternate-ego\frontend\src\app\onboarding\page.tsx"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update imports
content = content.replace(
    "import {\n    scrapeProfiles,\n    uploadPhoto,\n    uploadVoice,",
    "import {\n    scrapeProfiles,\n    uploadPhoto,\n    uploadSinglePhoto,\n    generateAllAvatars,\n    uploadVoice,"
)

# 2. Update capturePhoto function
old_capture = """    const capturePhoto = async () => {
        // Debounce: prevent rapid double-captures
        if (!videoRef.current || !canvasRef.current || !session || isCapturing) return;
        setIsCapturing(true);
        setIsGeneratingAvatar(true); // Show a generating indicator

        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(video, 0, 0);

        const base64 = canvas.toDataURL("image/jpeg", 0.85);
        const emotion = EMOTIONS[currentEmotion];

        try {
            const result = await uploadPhoto({
                twin_id: session.twin_id,
                session_id: session.session_id,
                emotion,
                photo: base64,
            });

            // Use the returned avatar URL if available, otherwise fallback to the captured base64
            const finalImage = result.avatar_url ? `http://localhost:8000${result.avatar_url}` : base64;
            const newPhotos = [...capturedPhotos, finalImage];
            setCapturedPhotos(newPhotos);

            if (currentEmotion < EMOTIONS.length - 1) {
                // Wait 600ms before allowing next capture to prevent race condition
                setTimeout(() => {
                    setCurrentEmotion(currentEmotion + 1);
                    setIsCapturing(false);
                    setIsGeneratingAvatar(false);
                }, 600);
            } else {
                // All photos captured, move to voice
                stopCamera();
                setIsGeneratingAvatar(false);
                setStep("voice");
            }
        } catch (e) {
            setError("Failed to upload photo and generate avatar.");
            setIsCapturing(false);
            setIsGeneratingAvatar(false);
        }
    };

    const retakePhoto = (index: number) => {
        const newPhotos = capturedPhotos.filter((_, i) => i !== index);
        setCapturedPhotos(newPhotos);
        setCurrentEmotion(index);
    };"""

new_capture = """    const capturePhoto = async () => {
        if (!videoRef.current || !canvasRef.current || !session || isCapturing) return;
        setIsCapturing(true);
        setIsGeneratingAvatar(true);

        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(video, 0, 0);

        const base64 = canvas.toDataURL("image/jpeg", 0.85);

        try {
            await uploadSinglePhoto({
                twin_id: session.twin_id,
                session_id: session.session_id,
                photo: base64,
            });

            const result = await generateAllAvatars(session.twin_id);
            
            const urls = EMOTIONS.map(e => `http://localhost:8000/static/storage/avatars/${session.twin_id}/${e}_avatar.png?t=${Date.now()}`);
            setCapturedPhotos(urls);
            setCurrentEmotion(4);
            
            // Give user time to see the generated avatars before moving
            setTimeout(() => {
                stopCamera();
                setStep("voice");
            }, 3000);
            
        } catch (e) {
            setError("Failed to upload photo and generate avatars.");
        } finally {
            setIsCapturing(false);
            setIsGeneratingAvatar(false);
        }
    };

    const retakePhoto = (index: number) => {
        setCapturedPhotos([]);
        setCurrentEmotion(0);
    };"""

content = content.replace(old_capture, new_capture)

# 3. Update UI texts
content = content.replace("Configure Your Avatar", "Configure Your Avatars")
content = content.replace("Capture four expressions to bring your digital twin to life", "Capture one photo to generate your emotion-synced digital twin")

# Expression pill
content = content.replace("Expression {currentEmotion + 1} / 4", "One-Shot AI Capture")

# Instruction text inside video frame
content = re.sub(
    r'<h2 style={{ fontSize: \'1\.5rem\', color: \'white\', fontWeight: 500, textShadow: \'0 2px 12px rgba\(0,0,0,0\.8\)\', marginBottom: \'4px\' }}>\s*\{EMOTION_ICONS\[EMOTIONS\[currentEmotion\]\]\} \{EMOTION_LABELS\[EMOTIONS\[currentEmotion\]\]\}\s*</h2>',
    "<h2 style={{ fontSize: '1.5rem', color: 'white', fontWeight: 500, textShadow: '0 2px 12px rgba(0,0,0,0.8)', marginBottom: '4px' }}>\n                                    {isGeneratingAvatar ? '✨ Generating 4 Avatars...' : 'Look straight & Smile slightly'}\n                                </h2>",
    content
)

# Right Sidebar title
content = content.replace("Capture Progress", "AI Avatars")
content = content.replace(">{capturedPhotos.length} / 4</span>", ">{capturedPhotos.length > 0 ? 'Ready' : 'Pending'}</span>")

# Right sidebar status
content = content.replace("{isCaptured ? '✓ Captured' : isCurrent ? 'Awaiting...' : 'Pending'}", "{isCaptured ? '✓ Generated' : isGeneratingAvatar ? '✨ Generating...' : 'Pending'}")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Restored UI successfully with single-photo logic!")
