import re

filepath = r"c:\Users\hp\Downloads\Alternate-ego\alternate-ego\frontend\src\app\onboarding\page.tsx"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

replacement = """    // CAMERA STEP
    if (step === "camera") {
        return (
            <>
            {/* Photo Preview Modal */}
            {previewPhoto && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-lg cursor-pointer"
                    onClick={() => setPreviewPhoto(null)}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        transition={{ type: "spring", bounce: 0.4 }}
                        className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <img src={previewPhoto} alt="Preview" className="w-full h-full object-contain" />
                        <button
                            onClick={() => setPreviewPhoto(null)}
                            className="absolute top-4 right-4 w-10 h-10 bg-black/50 hover:bg-black/80 text-white rounded-full flex items-center justify-center backdrop-blur-md transition-all"
                        >
                            ✕
                        </button>
                    </motion.div>
                </motion.div>
            )}

            <div style={{ height: '100vh', overflow: 'hidden', position: 'relative', background: '#07080d' }}>
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                
                {/* Background effects */}
                <div style={{ position: 'absolute', top: '-10%', right: '-5%', width: '60%', height: '60%', background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 60%)', filter: 'blur(80px)' }} />
                <div style={{ position: 'absolute', bottom: '-10%', left: '-5%', width: '50%', height: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.1) 0%, transparent 60%)', filter: 'blur(80px)' }} />

                <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%', maxHeight: 'calc(100vh - 3rem)', padding: '2rem 1rem' }}>
                    {/* Header */}
                    <motion.div
                        initial={{ opacity: 0, y: -15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        style={{ textAlign: 'center', paddingBottom: '1.5rem', flexShrink: 0 }}
                    >
                        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'white', letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>Create Your Avatars</h1>
                        <p style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.6)', fontWeight: 300 }}>Capture one photo to generate your emotion-synced digital twin</p>
                    </motion.div>

                    {/* Main Content */}
                    <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.15 }}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}
                    >
                        {!capturedOriginal ? (
                            // Camera View
                            <div style={{
                                position: 'relative',
                                borderRadius: '24px',
                                overflow: 'hidden',
                                background: '#000',
                                border: '1px solid rgba(255,255,255,0.1)',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                                width: '100%',
                                maxWidth: '600px',
                                aspectRatio: '4/3'
                            }}>
                                <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: 'scaleX(-1)' }} />
                                
                                {/* UI Overlays */}
                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '150px', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', pointerEvents: 'none' }} />

                                {/* Capture Button */}
                                <div style={{ position: 'absolute', bottom: '24px', left: 0, right: 0, zIndex: 10, display: 'flex', justifyItems: 'center', justifyContent: 'center' }}>
                                    <button
                                        onClick={capturePhoto}
                                        disabled={isCapturing}
                                        style={{
                                            width: '72px', height: '72px',
                                            borderRadius: '50%',
                                            border: '4px solid rgba(255,255,255,0.85)',
                                            padding: '4px',
                                            background: 'transparent',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        <div style={{
                                            width: '100%', height: '100%',
                                            borderRadius: '50%',
                                            background: 'rgba(255,255,255,0.9)',
                                            boxShadow: '0 0 20px rgba(255,255,255,0.3)',
                                        }} />
                                    </button>
                                </div>

                                {error && (
                                    <div style={{ position: 'absolute', top: '16px', left: 0, right: 0, zIndex: 30, display: 'flex', justifyContent: 'center' }}>
                                        <p style={{ background: 'rgba(239,68,68,0.9)', backdropFilter: 'blur(8px)', color: 'white', fontSize: '13px', padding: '8px 20px', borderRadius: '999px', fontWeight: 500 }}>{error}</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            // Results View
                            <div style={{ width: '100%', maxWidth: '900px' }}>
                                {isGeneratingAvatars ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', background: 'rgba(20,22,30,0.5)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '1rem', animation: 'pulse 1.5s infinite' }}>✨</div>
                                        <h3 style={{ fontSize: '1.5rem', color: 'white', fontWeight: 600, marginBottom: '0.5rem' }}>AI Magic at Work</h3>
                                        <p style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', maxWidth: '400px' }}>Generating your neutral, happy, sad, and angry avatars using Gemini 2.0 Flash...</p>
                                        <div style={{ width: '200px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', marginTop: '2rem', overflow: 'hidden' }}>
                                            <motion.div animate={{ x: ['-100%', '100%'] }} transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }} style={{ width: '50%', height: '100%', background: 'linear-gradient(90deg, #8b5cf6, #ec4899)', borderRadius: '4px' }} />
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                        {/* Avatar Grid */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                                            {EMOTIONS.map((emotion) => (
                                                <div key={emotion} style={{ background: 'rgba(20,22,30,0.5)', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column' }}>
                                                    <div style={{ aspectRatio: '1/1', position: 'relative', background: '#000', cursor: 'pointer' }} onClick={() => avatarUrls[emotion] && setPreviewPhoto(avatarUrls[emotion])}>
                                                        {avatarUrls[emotion] ? (
                                                            <img src={avatarUrls[emotion]} alt={emotion} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        ) : (
                                                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)' }}>Failed</div>
                                                        )}
                                                    </div>
                                                    <div style={{ padding: '0.75rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)' }}>
                                                        <span style={{ color: 'white', fontWeight: 600, fontSize: '0.9rem', textTransform: 'capitalize' }}>{EMOTION_ICONS[emotion]} {emotion}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Actions */}
                                        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                                            <button
                                                onClick={retakePhoto}
                                                style={{ padding: '12px 24px', borderRadius: '999px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontWeight: 500, transition: 'all 0.2s', cursor: 'pointer' }}
                                            >
                                                Retake Photo
                                            </button>
                                            <button
                                                onClick={() => setStep("voice")}
                                                style={{ padding: '12px 32px', borderRadius: '999px', background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', border: 'none', color: 'white', fontWeight: 600, transition: 'all 0.2s', cursor: 'pointer', boxShadow: '0 4px 20px rgba(139,92,246,0.3)' }}
                                            >
                                                Looks Good! Continue ➔
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </motion.div>
                </div>
            </div>
            </>
        );
    }
"""

new_content = re.sub(
    r'    // CAMERA STEP\n    if \(step === "camera"\) \{.*?(?=    // VOICE STEP — Premium Gen Z Voice Interview)',
    replacement,
    content,
    flags=re.DOTALL
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Replaced camera step successfully.")
