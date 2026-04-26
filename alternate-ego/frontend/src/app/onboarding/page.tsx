"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
    scrapeProfiles,
    uploadPhoto,
    uploadSinglePhoto,
    generateAllAvatars,
    uploadVoice,
    completeOnboarding,
    getInterviewQuestions,
    refreshQuestion,
    replaceVoice,
} from "@/lib/api";

// Onboarding steps
type Step = "scraping" | "camera" | "voice" | "generating";

const EMOTIONS = ["neutral", "happy", "sad", "angry"] as const;
const EMOTION_LABELS: Record<string, string> = {
    neutral: "Look straight at the camera (neutral expression)",
    happy: "Smile naturally (happy expression)",
    sad: "Show a sad expression",
    angry: "Show an angry expression",
};
const EMOTION_ICONS: Record<string, string> = {
    neutral: "😐",
    happy: "😊",
    sad: "😢",
    angry: "😠",
};

export default function OnboardingPage() {
    const router = useRouter();
    const [step, setStep] = useState<Step>("scraping");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [session, setSession] = useState<any>(null);
    const [error, setError] = useState("");

    // Camera state
    const [currentEmotion, setCurrentEmotion] = useState(0);
    const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
    const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Voice state
    const [questions, setQuestions] = useState<Array<{ index: number; text: string; category?: string }>>([]);
    const [currentQuestion, setCurrentQuestion] = useState(0);
    const [isRecording, setIsRecording] = useState(false);
    const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
    const [transcripts, setTranscripts] = useState<Array<{ question: string; answer: string }>>([]);
    const [timer, setTimer] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // New: Voice interview enhancements
    const [voiceAnsweredCount, setVoiceAnsweredCount] = useState(0); // Only counts voice-recorded answers
    const [lastRecordedBlob, setLastRecordedBlob] = useState<Blob | null>(null);
    const [showTryAgain, setShowTryAgain] = useState(false); // Show try again after recording
    const [lastTranscript, setLastTranscript] = useState(""); // Last transcription text
    const [isRefreshing, setIsRefreshing] = useState(false); // Loading state for refresh

    // Generating state
    const [generatingProgress, setGeneratingProgress] = useState(0);
    const [generatingText, setGeneratingText] = useState("Analyzing social data...");
    
    // Live WebSocket logs
    const [logs, setLogs] = useState<string[]>(["Initializing secure connection..."]);
    const wsRef = useRef<WebSocket | null>(null);

    // Load session from localStorage
    const loadQuestions = async () => {
        try {
            const data = await getInterviewQuestions();
            setQuestions(data.questions || []);
        } catch {
            // Fallback questions
            setQuestions([
                { index: 0, text: "Tell me about yourself — your background, work, and passions." },
                { index: 1, text: "What are your core values and beliefs?" },
                { index: 2, text: "How do your friends describe you?" },
                { index: 3, text: "What's a story that shaped who you are today?" },
                { index: 4, text: "What's your biggest achievement you're proud of?" },
                { index: 5, text: "How do you handle stress or difficult situations?" },
                { index: 6, text: "What makes you laugh or brings you joy?" },
                { index: 7, text: "What are your goals for the next few years?" },
                { index: 8, text: "If you could give advice to your younger self, what would it be?" },
            ]);
        }
    };

    const handleScraping = async (s: any) => {
        // Connect WebSocket for real-time logs
        const wsUrl = `ws://localhost:8000/ws/logs/${s.session_id}`;
        try {
            wsRef.current = new WebSocket(wsUrl);

            wsRef.current.onopen = () => {
                setLogs(prev => [...prev, "🔐 Secure connection established..."]);
            };

            wsRef.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === "log" && data.message) {
                        setLogs(prev => {
                            const updated = [...prev, data.message];
                            return updated.slice(-12); // Keep last 12 logs
                        });
                    }
                } catch { /* ignore parse errors */ }
            };

            wsRef.current.onerror = () => {
                setLogs(prev => [...prev, "⚠️ Could not connect to log server (continuing anyway)..."]);
            };
        } catch {
            // WebSocket not available — continue without live logs
        }

        try {
            await scrapeProfiles({
                twin_id: s.twin_id,
                session_id: s.session_id,
                name: s.name,
                linkedin_url: s.linkedin_url || "",
                instagram_url: s.instagram_url || "",
                twitter_url: s.twitter_url || "",
                facebook_url: s.facebook_url || "",
                other_url: s.other_url || "",
            });
            setLogs(prev => [...prev, "✅ Scraping complete! Processing profile..."]);
        } catch (e) {
            console.warn("Scraping failed, continuing anyway:", e);
            setLogs(prev => [...prev, "⚠️ Scraping encountered issues. Continuing with partial data..."]);
        }

        // Move to camera step after scraping (even if it fails)
        setTimeout(() => {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            setStep("camera");
        }, 2000);
    };

    useEffect(() => {
        const sessionData = localStorage.getItem("ego_session");
        if (!sessionData) {
            router.push("/");
            return;
        }
        const s = JSON.parse(sessionData);
        setSession(s);

        // Load questions
        loadQuestions();

        // Start scraping automatically
        handleScraping(s);

        // Cleanup WebSocket on unmount
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Camera functions
    const startCamera = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: "user" },
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            streamRef.current = stream;
        } catch (e) {
            setError("Camera access denied. Please allow camera access.");
        }
    }, []);

    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (step === "camera") {
            startCamera();
        }
        return () => {
            if (step === "camera") stopCamera();
        };
    }, [step, startCamera, stopCamera]);

    const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);

    const capturePhoto = async () => {
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
    };

    // Voice functions
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
            const chunks: Blob[] = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: "audio/webm" });
                setAudioChunks((prev) => [...prev, blob]);
                stream.getTracks().forEach((t) => t.stop());
                // Don't auto-advance — show Try Again option first
                setLastRecordedBlob(blob);
                handleVoiceUpload(blob);
            };

            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.start();
            setIsRecording(true);
            setShowTryAgain(false);

            // Start timer
            setTimer(0);
            timerRef.current = setInterval(() => {
                setTimer((t) => {
                    if (t >= 119) {
                        // Auto-stop at 120 seconds (2 mins)
                        setTimeout(() => stopRecording(), 100);
                        return 120;
                    }
                    return t + 1;
                });
            }, 1000);
        } catch {
            setError("Microphone access denied.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (timerRef.current) clearInterval(timerRef.current);
        }
    };

    const handleVoiceUpload = async (blob: Blob) => {
        if (!session) return;
        try {
            const result = await uploadVoice({
                twin_id: session.twin_id,
                session_id: session.session_id,
                question_index: currentQuestion,
                audio: blob,
            });

            const transcriptText = result.transcript || "";
            setLastTranscript(transcriptText);

            const newTranscript = {
                question: questions[currentQuestion]?.text || `Question ${currentQuestion + 1}`,
                answer: transcriptText,
            };
            
            // Update transcripts (replace if re-recording same question)
            setTranscripts((prev) => {
                const existing = prev.findIndex(t => t.question === newTranscript.question);
                if (existing >= 0) {
                    const updated = [...prev];
                    updated[existing] = newTranscript;
                    return updated;
                }
                return [...prev, newTranscript];
            });

            // Show Try Again option instead of auto-advancing
            setShowTryAgain(true);
            setVoiceAnsweredCount((prev) => {
                // Only count if this question wasn't already voice-answered
                const alreadyCounted = prev > currentQuestion;
                return alreadyCounted ? prev : prev + 1;
            });
        } catch (e) {
            console.error("Voice upload failed:", e);
            setError("Voice upload failed. Try again.");
        }
    };

    // Accept current recording and move to next question
    const acceptAndNext = () => {
        setShowTryAgain(false);
        setLastRecordedBlob(null);
        setLastTranscript("");

        const minVoiceAnswers = 5;
        if (currentQuestion < questions.length - 1) {
            setCurrentQuestion(currentQuestion + 1);
        } else if (voiceAnsweredCount >= minVoiceAnswers) {
            // All questions done and minimum met
            setStep("generating");
            handleComplete();
        } else {
            // Need more voice answers — fetch more questions
            handleRefreshQuestion();
        }
    };

    // Try Again — re-record the current answer
    const handleTryAgain = () => {
        setShowTryAgain(false);
        setLastRecordedBlob(null);
        setLastTranscript("");
        // Decrement voice count since we're re-recording
        setVoiceAnsweredCount((prev) => Math.max(0, prev - 1));
        // Start recording again automatically
        startRecording();
    };

    // Refresh Question — swap current question for a new one (doesn't count)
    const handleRefreshQuestion = async () => {
        setIsRefreshing(true);
        try {
            const currentTexts = questions.map(q => q.text);
            const data = await refreshQuestion(currentTexts);
            if (data.question) {
                setQuestions((prev) => {
                    const updated = [...prev];
                    // If we're past the end, add a new question
                    if (currentQuestion >= updated.length) {
                        updated.push({
                            index: updated.length,
                            text: data.question.text,
                            category: data.question.category,
                        });
                    } else {
                        updated[currentQuestion] = {
                            ...updated[currentQuestion],
                            text: data.question.text,
                            category: data.question.category,
                        };
                    }
                    return updated;
                });
            }
        } catch (e) {
            console.error("Failed to refresh question:", e);
        } finally {
            setIsRefreshing(false);
        }
    };

    const skipQuestion = () => {
        // Skip does NOT count toward voice-answered minimum
        const newTranscript = {
            question: questions[currentQuestion]?.text || `Question ${currentQuestion + 1}`,
            answer: "",
        };
        setTranscripts((prev) => [...prev, newTranscript]);
        setShowTryAgain(false);
        setLastRecordedBlob(null);
        setLastTranscript("");

        if (currentQuestion < questions.length - 1) {
            setCurrentQuestion(currentQuestion + 1);
        } else if (voiceAnsweredCount >= 5) {
            setStep("generating");
            handleComplete();
        } else {
            // Need more voice answers — fetch another question
            handleRefreshQuestion();
        }
    };

    // Complete onboarding
    const handleComplete = async () => {
        if (!session) return;

        const stages = [
            "Analyzing social data...",
            "Processing voice patterns...",
            "Extracting personality traits...",
            "Building personality profile...",
            "Creating your digital twin...",
            "Almost ready...",
        ];

        for (let i = 0; i < stages.length; i++) {
            setGeneratingText(stages[i]);
            setGeneratingProgress(((i + 1) / stages.length) * 100);
            await new Promise((r) => setTimeout(r, 1500));
        }

        try {
            await completeOnboarding({
                twin_id: session.twin_id,
                session_id: session.session_id,
                transcripts,
            });
        } catch (e) {
            console.error("Completion failed:", e);
        }

        // Navigate to chat
        router.push("/chat");
    };

    const formatTime = (s: number) =>
        `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

    // --- RENDER ---

    // SCRAPING STEP
    if (step === "scraping") {
        const SOCIAL_ICONS = [
            { name: "LinkedIn", color: "#0A66C2", icon: (
                <svg viewBox="0 0 24 24" fill="currentColor" style={{width:'28px',height:'28px'}}><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            )},
            { name: "Instagram", color: "#E4405F", icon: (
                <svg viewBox="0 0 24 24" fill="currentColor" style={{width:'28px',height:'28px'}}><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 100-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 11-2.88 0 1.441 1.441 0 012.88 0z"/></svg>
            )},
            { name: "Twitter", color: "#1DA1F2", icon: (
                <svg viewBox="0 0 24 24" fill="currentColor" style={{width:'28px',height:'28px'}}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            )},
            { name: "Facebook", color: "#1877F2", icon: (
                <svg viewBox="0 0 24 24" fill="currentColor" style={{width:'28px',height:'28px'}}><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            )},
            { name: "GitHub", color: "#fff", icon: (
                <svg viewBox="0 0 24 24" fill="currentColor" style={{width:'28px',height:'28px'}}><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
            )},
        ];

        return (
            <div style={{ height: '100vh', overflow: 'hidden', position: 'relative', background: '#07080d' }}>
                {/* Mountain background */}
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 0,
                    backgroundImage: 'url(https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=2070&auto=format&fit=crop)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'brightness(0.35) saturate(1.3)',
                }} />
                {/* Dark overlay on mountain */}
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 0,
                    background: 'linear-gradient(180deg, rgba(7,8,13,0.7) 0%, rgba(7,8,13,0.5) 40%, rgba(7,8,13,0.85) 100%)',
                }} />
                {/* Animated grid background */}
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 1,
                    backgroundImage: 'linear-gradient(rgba(139,92,246,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.06) 1px, transparent 1px)',
                    backgroundSize: '60px 60px',
                }} />

                {/* Radial glow */}
                <motion.div
                    animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
                    transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
                    style={{
                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        width: '600px', height: '600px', borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(139,92,246,0.2) 0%, rgba(99,102,241,0.1) 40%, transparent 70%)',
                        zIndex: 1, pointerEvents: 'none',
                    }}
                />

                {/* Floating particles */}
                {Array.from({ length: 20 }).map((_, i) => (
                    <motion.div
                        key={`p-${i}`}
                        animate={{
                            y: [0, -800],
                            x: [0, (Math.random() - 0.5) * 200],
                            opacity: [0, 0.8, 0],
                        }}
                        transition={{
                            repeat: Infinity,
                            duration: 4 + Math.random() * 4,
                            delay: Math.random() * 5,
                            ease: 'linear',
                        }}
                        style={{
                            position: 'absolute',
                            bottom: '-20px',
                            left: `${10 + Math.random() * 80}%`,
                            width: `${2 + Math.random() * 4}px`,
                            height: `${2 + Math.random() * 4}px`,
                            borderRadius: '50%',
                            background: ['#8b5cf6', '#6366f1', '#3b82f6', '#06b6d4', '#ec4899', '#f59e0b'][i % 6],
                            zIndex: 2,
                            pointerEvents: 'none',
                        }}
                    />
                ))}

                {/* Main content */}
                <div style={{ position: 'relative', zIndex: 10, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>

                    {/* Orbiting Social Icons */}
                    <div style={{ position: 'relative', width: '280px', height: '280px', marginBottom: '2rem' }}>
                        {/* Center core */}
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 20 }}>
                            <motion.div
                                animate={{ scale: [1, 1.15, 1], boxShadow: ['0 0 40px rgba(139,92,246,0.4)', '0 0 80px rgba(139,92,246,0.6)', '0 0 40px rgba(139,92,246,0.4)'] }}
                                transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
                                style={{
                                    width: '80px', height: '80px', borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #8b5cf6, #6366f1, #3b82f6)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: '3px solid rgba(255,255,255,0.2)',
                                }}
                            >
                                <motion.span
                                    animate={{ rotate: [0, 360] }}
                                    transition={{ repeat: Infinity, duration: 8, ease: 'linear' }}
                                    style={{ fontSize: '2rem' }}
                                >🧠</motion.span>
                            </motion.div>
                        </div>

                        {/* Orbit ring */}
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 20, ease: 'linear' }}
                            style={{
                                position: 'absolute', inset: 0,
                                border: '1px dashed rgba(139,92,246,0.25)',
                                borderRadius: '50%',
                            }}
                        />
                        <motion.div
                            animate={{ rotate: -360 }}
                            transition={{ repeat: Infinity, duration: 15, ease: 'linear' }}
                            style={{
                                position: 'absolute', inset: '30px',
                                border: '1px dashed rgba(99,102,241,0.2)',
                                borderRadius: '50%',
                            }}
                        />

                        {/* Orbiting icons */}
                        {SOCIAL_ICONS.map((social, i) => {
                            const angle = (i / SOCIAL_ICONS.length) * 360;
                            const radius = 130;
                            return (
                                <motion.div
                                    key={social.name}
                                    animate={{ rotate: 360 }}
                                    transition={{ repeat: Infinity, duration: 12 + i * 2, ease: 'linear' }}
                                    style={{
                                        position: 'absolute',
                                        top: '50%', left: '50%',
                                        width: 0, height: 0,
                                        transformOrigin: '0 0',
                                    }}
                                >
                                    <motion.div
                                        animate={{
                                            rotate: -360,
                                            scale: [1, 1.2, 1],
                                        }}
                                        transition={{
                                            rotate: { repeat: Infinity, duration: 12 + i * 2, ease: 'linear' },
                                            scale: { repeat: Infinity, duration: 2, delay: i * 0.3 },
                                        }}
                                        style={{
                                            position: 'absolute',
                                            top: -radius * Math.sin((angle * Math.PI) / 180) - 24,
                                            left: radius * Math.cos((angle * Math.PI) / 180) - 24,
                                            width: '48px', height: '48px',
                                            borderRadius: '16px',
                                            background: 'rgba(20,22,30,0.8)',
                                            backdropFilter: 'blur(12px)',
                                            border: `2px solid ${social.color}40`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: social.color,
                                            boxShadow: `0 0 20px ${social.color}30`,
                                        }}
                                    >
                                        {social.icon}
                                    </motion.div>

                                    {/* Data stream particle from icon to center */}
                                    <motion.div
                                        animate={{
                                            opacity: [0, 1, 0],
                                            x: [radius * Math.cos((angle * Math.PI) / 180), 0],
                                            y: [-radius * Math.sin((angle * Math.PI) / 180), 0],
                                        }}
                                        transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.4, ease: 'easeIn' }}
                                        style={{
                                            position: 'absolute',
                                            width: '6px', height: '6px',
                                            borderRadius: '50%',
                                            background: social.color,
                                            boxShadow: `0 0 8px ${social.color}`,
                                        }}
                                    />
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* Glitch Text */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                        style={{ textAlign: 'center', marginBottom: '1.5rem' }}
                    >
                        <h1 style={{
                            fontSize: 'clamp(2rem, 5vw, 3.5rem)',
                            fontWeight: 700,
                            color: 'white',
                            letterSpacing: '-0.03em',
                            lineHeight: 1.1,
                            marginBottom: '0.5rem',
                        }}>
                            Building Your{' '}
                            <span style={{
                                background: 'linear-gradient(135deg, #8b5cf6, #ec4899, #6366f1)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                            }}>Digital DNA</span>
                        </h1>
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '1rem', fontWeight: 300, maxWidth: '400px', margin: '0 auto' }}>
                            Fetching data for <span style={{ color: '#a78bfa', fontWeight: 600 }}>{session?.name || "you"}</span>
                        </p>
                    </motion.div>

                    {/* Terminal-like WebSocket status messages */}
                    <div style={{
                        height: '160px',
                        width: '100%',
                        maxWidth: '600px',
                        overflowY: 'auto',
                        background: 'rgba(20,22,30,0.7)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(139,92,246,0.3)',
                        borderRadius: '16px',
                        padding: '1rem',
                        marginBottom: '2rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.5), inset 0 0 20px rgba(139,92,246,0.05)',
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {logs.map((msg, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.3 }}
                                    style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}
                                >
                                    <span style={{ color: '#8b5cf6', fontFamily: 'monospace', fontSize: '0.8rem', marginTop: '2px' }}>&gt;</span>
                                    <span style={{
                                        color: msg.includes('✅') ? '#4ade80' : msg.includes('⚠️') ? '#facc15' : 'rgba(255,255,255,0.85)',
                                        fontSize: '0.85rem',
                                        fontFamily: 'monospace',
                                        letterSpacing: '0.02em',
                                        lineHeight: 1.4,
                                        wordBreak: 'break-word'
                                    }}>
                                        {msg}
                                    </span>
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    {/* Animated progress bar */}
                    <motion.div
                        initial={{ opacity: 0, scaleX: 0.8 }}
                        animate={{ opacity: 1, scaleX: 1 }}
                        transition={{ delay: 0.5 }}
                        style={{ width: '320px', maxWidth: '80vw' }}
                    >
                        <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '99px', overflow: 'hidden' }}>
                            <motion.div
                                animate={{ x: ['-100%', '100%'] }}
                                transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                                style={{
                                    width: '40%', height: '100%',
                                    background: 'linear-gradient(90deg, transparent, #8b5cf6, #6366f1, transparent)',
                                    borderRadius: '99px',
                                }}
                            />
                        </div>
                    </motion.div>
                </div>
            </div>
        );
    }

    // CAMERA STEP
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
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', bounce: 0.3 }}
                        className="relative max-w-lg w-[90vw] max-h-[80vh] rounded-3xl overflow-hidden shadow-2xl border border-white/20"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <img src={previewPhoto} alt="Preview" className="w-full h-full object-cover" />
                        <button
                            onClick={() => setPreviewPhoto(null)}
                            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-red-500/80 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </motion.div>
                </motion.div>
            )}

            <div style={{ height: '100vh', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
                <div className="form-bg" />
                <div className="form-bg-overlay" />
                <canvas ref={canvasRef} className="hidden" />

                <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '1100px', display: 'flex', flexDirection: 'column', height: '100%', maxHeight: 'calc(100vh - 3rem)' }}>
                    {/* Header */}
                    <motion.div
                        initial={{ opacity: 0, y: -15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        style={{ textAlign: 'center', paddingTop: '0.5rem', paddingBottom: '1rem', flexShrink: 0 }}
                    >
                        <h1 style={{ fontSize: '1.8rem', fontWeight: 600, color: 'white', letterSpacing: '-0.02em', marginBottom: '0.3rem' }}>Configure Your Avatars</h1>
                        <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', fontWeight: 300 }}>Capture one photo to generate your emotion-synced digital twin</p>
                    </motion.div>

                    {/* Main Content - Camera + Sidebar */}
                    <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.15 }}
                        style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '1.2rem', minHeight: 0 }}
                    >
                        {/* Left: Camera Feed */}
                        <div style={{
                            position: 'relative',
                            borderRadius: '24px',
                            overflow: 'hidden',
                            background: '#000',
                            border: '1px solid rgba(255,255,255,0.1)',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                        }}>
                            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            
                            {/* Top gradient */}
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '120px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)', pointerEvents: 'none', zIndex: 2 }} />
                            {/* Bottom gradient */}
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '150px', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', pointerEvents: 'none', zIndex: 2 }} />

                            {/* Expression pill */}
                            <div style={{ position: 'absolute', top: '16px', left: 0, right: 0, zIndex: 10, textAlign: 'center' }}>
                                <span style={{
                                    display: 'inline-block',
                                    padding: '6px 16px',
                                    borderRadius: '999px',
                                    background: 'rgba(255,255,255,0.12)',
                                    backdropFilter: 'blur(12px)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    fontSize: '11px',
                                    letterSpacing: '0.12em',
                                    textTransform: 'uppercase' as const,
                                    color: 'rgba(255,255,255,0.9)',
                                    fontWeight: 600,
                                }}>
                                    One-Shot AI Capture
                                </span>
                            </div>

                            {/* Instruction text */}
                            <div style={{ position: 'absolute', bottom: '90px', left: 0, right: 0, zIndex: 10, textAlign: 'center', padding: '0 1rem' }}>
                                <h2 style={{ fontSize: '1.5rem', color: 'white', fontWeight: 500, textShadow: '0 2px 12px rgba(0,0,0,0.8)', marginBottom: '4px' }}>
                                    {isGeneratingAvatar ? '✨ Generating 4 Avatars...' : 'Look straight & Smile slightly'}
                                </h2>
                            </div>

                            {/* Capture Button */}
                            <div style={{ position: 'absolute', bottom: '20px', left: 0, right: 0, zIndex: 10, display: 'flex', justifyContent: 'center' }}>
                                <button
                                    onClick={capturePhoto}
                                    disabled={isCapturing || isGeneratingAvatar}
                                    style={{
                                        width: '68px', height: '68px',
                                        borderRadius: '50%',
                                        border: `4px solid ${isGeneratingAvatar ? 'rgba(139,92,246,0.85)' : 'rgba(255,255,255,0.85)'}`,
                                        padding: '4px',
                                        background: 'transparent',
                                        cursor: isGeneratingAvatar ? 'wait' : 'pointer',
                                        transition: 'all 0.2s',
                                        opacity: isGeneratingAvatar ? 0.7 : 1,
                                    }}
                                    onMouseDown={(e) => { if (!isGeneratingAvatar) e.currentTarget.style.transform = 'scale(0.92)' }}
                                    onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                                    aria-label="Capture Photo"
                                >
                                    <div style={{
                                        width: '100%', height: '100%',
                                        borderRadius: '50%',
                                        background: isGeneratingAvatar ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : 'rgba(255,255,255,0.9)',
                                        boxShadow: isGeneratingAvatar ? '0 0 20px rgba(139,92,246,0.6)' : '0 0 20px rgba(255,255,255,0.3)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        animation: isGeneratingAvatar ? 'pulse 1.5s infinite' : 'none',
                                    }}>
                                        {isGeneratingAvatar && <span style={{ fontSize: '1.2rem' }}>✨</span>}
                                    </div>
                                </button>
                            </div>

                            {/* Live badge */}
                            <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 10, display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '999px', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444', animation: 'pulse 2s ease-in-out infinite' }} />
                                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.8)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Live</span>
                            </div>

                            {error && (
                                <div style={{ position: 'absolute', bottom: '8px', left: 0, right: 0, zIndex: 30, display: 'flex', justifyContent: 'center' }}>
                                    <p style={{ background: 'rgba(239,68,68,0.9)', backdropFilter: 'blur(8px)', color: 'white', fontSize: '12px', padding: '6px 16px', borderRadius: '999px', fontWeight: 500 }}>{error}</p>
                                </div>
                            )}
                        </div>

                        {/* Right: AI Avatars Sidebar */}
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column' as const,
                            background: 'rgba(20,22,30,0.5)',
                            backdropFilter: 'blur(24px)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '24px',
                            padding: '1.5rem',
                            overflow: 'hidden',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
                        }}>
                            {/* Sidebar Header */}
                            <div style={{ marginBottom: '1rem', flexShrink: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'white' }}>AI Avatars</h3>
                                    <span style={{ fontSize: '0.8rem', color: '#a78bfa', fontWeight: 600 }}>{capturedPhotos.length > 0 ? 'Ready' : 'Pending'}</span>
                                </div>
                                {/* Progress bar */}
                                <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '99px', overflow: 'hidden', marginTop: '8px' }}>
                                    <motion.div
                                        animate={{ width: `${(capturedPhotos.length / 4) * 100}%` }}
                                        transition={{ duration: 0.5, ease: 'easeOut' }}
                                        style={{ height: '100%', background: 'linear-gradient(90deg, #8b5cf6, #6366f1)', borderRadius: '99px' }}
                                    />
                                </div>
                            </div>

                            {/* Expression List */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, gap: '0.6rem', overflow: 'auto' }}>
                                {EMOTIONS.map((emotion, i) => {
                                    const isCurrent = i === currentEmotion;
                                    const isCaptured = i < capturedPhotos.length;

                                    return (
                                        <div
                                            key={emotion}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.8rem',
                                                padding: '0.7rem 0.8rem',
                                                borderRadius: '16px',
                                                transition: 'all 0.3s',
                                                background: isCurrent ? 'rgba(139,92,246,0.15)' : 'transparent',
                                                border: isCurrent ? '1px solid rgba(139,92,246,0.3)' : '1px solid transparent',
                                                opacity: isCaptured ? 1 : isCurrent ? 1 : 0.45,
                                            }}
                                        >
                                            {/* Thumbnail */}
                                            <div
                                                style={{
                                                    width: '60px', height: '60px',
                                                    borderRadius: '14px',
                                                    overflow: 'hidden',
                                                    background: 'rgba(0,0,0,0.4)',
                                                    border: isCaptured ? '2px solid rgba(52,199,89,0.6)' : isCurrent ? '2px solid rgba(139,92,246,0.5)' : '2px solid rgba(255,255,255,0.08)',
                                                    position: 'relative',
                                                    flexShrink: 0,
                                                    cursor: isCaptured ? 'pointer' : 'default',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}
                                                onClick={() => isCaptured && setPreviewPhoto(capturedPhotos[i])}
                                            >
                                                {isCaptured ? (
                                                    <motion.img
                                                        initial={{ opacity: 0, scale: 0.85 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        transition={{ type: 'spring', bounce: 0.4 }}
                                                        src={capturedPhotos[i]}
                                                        alt={emotion}
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    />
                                                ) : (
                                                    <span style={{ fontSize: '1.6rem', opacity: isCurrent ? 0.8 : 0.3 }}>{EMOTION_ICONS[emotion]}</span>
                                                )}
                                            </div>

                                            {/* Info */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <h4 style={{ color: 'white', fontWeight: 500, fontSize: '0.95rem', textTransform: 'capitalize' as const, letterSpacing: '0.02em' }}>{emotion}</h4>
                                                <p style={{ color: isCaptured ? 'rgba(52,199,89,0.85)' : 'rgba(255,255,255,0.45)', fontSize: '0.75rem', marginTop: '2px' }}>
                                                    {isCaptured ? '✓ Generated' : isGeneratingAvatar ? '✨ Generating...' : 'Pending'}
                                                </p>
                                            </div>

                                            {/* Action buttons */}
                                            {isCaptured && (
                                                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                                    {/* Preview */}
                                                    <button
                                                        onClick={() => setPreviewPhoto(capturedPhotos[i])}
                                                        style={{
                                                            width: '32px', height: '32px',
                                                            borderRadius: '10px',
                                                            background: 'rgba(255,255,255,0.08)',
                                                            border: '1px solid rgba(255,255,255,0.12)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            cursor: 'pointer', color: 'rgba(255,255,255,0.7)',
                                                            transition: 'all 0.2s',
                                                        }}
                                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.3)'; e.currentTarget.style.color = 'white'; }}
                                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
                                                        title="Preview photo"
                                                    >
                                                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                                        </svg>
                                                    </button>
                                                    {/* Retake (cross) */}
                                                    <button
                                                        onClick={() => retakePhoto(i)}
                                                        style={{
                                                            width: '32px', height: '32px',
                                                            borderRadius: '10px',
                                                            background: 'rgba(255,255,255,0.08)',
                                                            border: '1px solid rgba(255,255,255,0.12)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            cursor: 'pointer', color: 'rgba(255,255,255,0.7)',
                                                            transition: 'all 0.2s',
                                                        }}
                                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.3)'; e.currentTarget.style.color = 'white'; }}
                                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
                                                        title="Retake photo"
                                                    >
                                                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Helpful tip at bottom */}
                            <div style={{
                                marginTop: '0.8rem',
                                padding: '0.7rem 1rem',
                                background: 'rgba(255,255,255,0.04)',
                                borderRadius: '14px',
                                border: '1px solid rgba(255,255,255,0.06)',
                                flexShrink: 0,
                            }}>
                                <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.4, textAlign: 'center' }}>
                                    💡 Click any captured photo to preview it full-size. Use the ✕ button to retake.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
            </>
        );
    }

    // VOICE STEP — Premium Gen Z Voice Interview
    if (step === "voice") {
        const category = (questions[currentQuestion] as { category?: string })?.category || "personality";
        const CATEGORY_ICONS: Record<string, string> = {
            identity: "🪪", values: "💎", personality: "🎭", emotions: "💗",
            passions: "🔥", stories: "📖", communication: "💬", goals: "🎯",
        };

        return (
            <div style={{ height: '100vh', overflow: 'hidden', position: 'relative', background: '#07080d' }}>
                {/* Mountain BG */}
                <div style={{
                    position: 'absolute', inset: 0,
                    backgroundImage: 'url(https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=2070&auto=format&fit=crop)',
                    backgroundSize: 'cover', backgroundPosition: 'center',
                    filter: 'brightness(0.3) saturate(1.3)',
                }} />
                <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(180deg, rgba(7,8,13,0.6) 0%, rgba(7,8,13,0.4) 40%, rgba(7,8,13,0.85) 100%)',
                }} />

                <div style={{ position: 'relative', zIndex: 10, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                    {/* Header */}
                    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                        <h1 style={{
                            fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 700, color: 'white', marginBottom: '0.3rem',
                        }}>
                            Voice <span style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Interview</span>
                        </h1>
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>
                            ✅ Photos captured • Now answer with your voice
                        </p>
                    </motion.div>

                    {/* Main Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        style={{
                            width: '100%', maxWidth: '600px',
                            background: 'rgba(12,14,22,0.6)', backdropFilter: 'blur(24px)',
                            border: '1px solid rgba(255,255,255,0.08)', borderRadius: '28px',
                            padding: '2rem', boxShadow: '0 30px 60px rgba(0,0,0,0.5)',
                        }}
                    >
                        {/* Progress Bar + Voice Count */}
                        <div style={{ marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Progress</span>
                                <span style={{ fontSize: '0.7rem', color: '#a78bfa', fontWeight: 600 }}>{currentQuestion + 1} / {questions.length}</span>
                            </div>
                            <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '99px', overflow: 'hidden' }}>
                                <motion.div
                                    animate={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
                                    transition={{ duration: 0.5 }}
                                    style={{ height: '100%', background: 'linear-gradient(90deg, #8b5cf6, #ec4899)', borderRadius: '99px' }}
                                />
                            </div>
                            {/* Voice answered badge */}
                            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
                                <span style={{
                                    padding: '4px 14px', borderRadius: '999px',
                                    background: voiceAnsweredCount >= 5 ? 'rgba(74,222,128,0.15)' : 'rgba(251,191,36,0.12)',
                                    border: `1px solid ${voiceAnsweredCount >= 5 ? 'rgba(74,222,128,0.3)' : 'rgba(251,191,36,0.25)'}`,
                                    fontSize: '0.7rem',
                                    color: voiceAnsweredCount >= 5 ? '#4ade80' : '#fbbf24',
                                    fontWeight: 600,
                                    display: 'flex', alignItems: 'center', gap: '5px',
                                }}>
                                    {voiceAnsweredCount >= 5 ? '✅' : '🎤'} {voiceAnsweredCount}/5 voice answers {voiceAnsweredCount >= 5 ? '(minimum met!)' : '(minimum required)'}
                                </span>
                            </div>
                        </div>

                        {/* Category Badge + Refresh Button */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '1rem', alignItems: 'center' }}>
                            <span style={{
                                padding: '5px 14px', borderRadius: '999px',
                                background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)',
                                fontSize: '0.7rem', color: '#a78bfa', fontWeight: 500,
                                display: 'flex', alignItems: 'center', gap: '6px',
                            }}>
                                {CATEGORY_ICONS[category] || '🎭'} {category.replace('_', ' ').toUpperCase()}
                            </span>
                            {/* Refresh Question Button */}
                            {!isRecording && !showTryAgain && (
                                <button
                                    onClick={handleRefreshQuestion}
                                    disabled={isRefreshing}
                                    title="Get a different question"
                                    style={{
                                        padding: '5px 12px', borderRadius: '999px',
                                        background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)',
                                        fontSize: '0.7rem', color: '#60a5fa', fontWeight: 500,
                                        cursor: isRefreshing ? 'not-allowed' : 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '5px',
                                        transition: 'all 0.2s',
                                        opacity: isRefreshing ? 0.5 : 1,
                                    }}
                                >
                                    {isRefreshing ? '⏳' : '🔄'} New Question
                                </button>
                            )}
                        </div>

                        {/* Question */}
                        <div style={{
                            padding: '1.2rem 1.5rem', borderRadius: '18px',
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                            marginBottom: '1.5rem', textAlign: 'center',
                        }}>
                            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '1.05rem', fontWeight: 500, lineHeight: 1.5 }}>
                                {questions[currentQuestion]?.text || "Loading question..."}
                            </p>
                        </div>

                        {/* Waveform / Timer / Transcript Preview */}
                        {isRecording ? (
                            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                                {/* Circular Timer */}
                                <div style={{ position: 'relative', width: '100px', height: '100px', margin: '0 auto 1rem' }}>
                                    <svg width="100" height="100" style={{ transform: 'rotate(-90deg)' }}>
                                        <circle cx="50" cy="50" r="45" stroke="rgba(255,255,255,0.06)" strokeWidth="4" fill="none" />
                                        <circle cx="50" cy="50" r="45" stroke="#8b5cf6" strokeWidth="4" fill="none"
                                            strokeDasharray={`${2 * Math.PI * 45}`}
                                            strokeDashoffset={`${2 * Math.PI * 45 * (1 - timer / 120)}`}
                                            strokeLinecap="round"
                                            style={{ transition: 'stroke-dashoffset 1s linear' }}
                                        />
                                    </svg>
                                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <span style={{ fontSize: '1.3rem', fontFamily: 'monospace', color: timer > 105 ? '#f87171' : '#a78bfa', fontWeight: 600 }}>
                                            {formatTime(timer)}
                                        </span>
                                    </div>
                                </div>

                                {/* Animated Waveform Bars */}
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '3px', height: '40px', marginBottom: '0.5rem' }}>
                                    {Array.from({ length: 20 }).map((_, i) => (
                                        <motion.div
                                            key={i}
                                            animate={{ height: [8, 15 + Math.random() * 25, 8] }}
                                            transition={{ repeat: Infinity, duration: 0.5 + Math.random() * 0.5, delay: i * 0.05 }}
                                            style={{
                                                width: '3px', borderRadius: '99px',
                                                background: `linear-gradient(to top, #8b5cf6, #ec4899)`,
                                            }}
                                        />
                                    ))}
                                </div>

                                {timer > 105 && (
                                    <motion.p animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 0.8 }}
                                        style={{ color: '#f87171', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                        Auto-stopping soon
                                    </motion.p>
                                )}
                            </div>
                        ) : showTryAgain ? (
                            /* After recording — show transcript preview + Try Again / Accept */
                            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    style={{
                                        padding: '1rem 1.2rem', borderRadius: '16px',
                                        background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)',
                                        marginBottom: '1rem',
                                    }}
                                >
                                    <p style={{ fontSize: '0.7rem', color: 'rgba(74,222,128,0.8)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
                                        ✅ Recorded Successfully
                                    </p>
                                    {lastTranscript && (
                                        <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.4, fontStyle: 'italic' }}>
                                            &ldquo;{lastTranscript.slice(0, 150)}{lastTranscript.length > 150 ? '...' : ''}&rdquo;
                                        </p>
                                    )}
                                </motion.div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                                <div style={{
                                    width: '80px', height: '80px', borderRadius: '50%',
                                    background: 'rgba(139,92,246,0.1)', border: '2px solid rgba(139,92,246,0.2)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '2rem',
                                }}>🎙️</div>
                            </div>
                        )}

                        {/* Controls — context-aware buttons */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            {showTryAgain ? (
                                /* After recording: Try Again + Accept & Next */
                                <>
                                    <button onClick={handleTryAgain} style={{
                                        padding: '12px 24px', borderRadius: '999px',
                                        background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)',
                                        color: '#fbbf24', fontWeight: 600, fontSize: '0.85rem',
                                        cursor: 'pointer', transition: 'all 0.3s',
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                    }}>
                                        🔁 Try Again
                                    </button>
                                    <button onClick={acceptAndNext} style={{
                                        padding: '12px 28px', borderRadius: '999px',
                                        background: 'linear-gradient(135deg, #059669, #10b981)',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        color: 'white', fontWeight: 600, fontSize: '0.85rem',
                                        cursor: 'pointer', boxShadow: '0 4px 20px rgba(16,185,129,0.3)',
                                        transition: 'all 0.3s', display: 'flex', alignItems: 'center', gap: '6px',
                                    }}>
                                        ✅ Accept & Next
                                    </button>
                                </>
                            ) : !isRecording ? (
                                /* Before recording: Start Recording + Refresh + Skip */
                                <>
                                    <button onClick={startRecording} style={{
                                        padding: '14px 32px', borderRadius: '999px',
                                        background: 'linear-gradient(135deg, #5b2da0, #7c3aed, #6366f1)',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        color: 'white', fontWeight: 600, fontSize: '0.9rem',
                                        cursor: 'pointer', boxShadow: '0 4px 20px rgba(124,58,237,0.3)',
                                        transition: 'all 0.3s', display: 'flex', alignItems: 'center', gap: '8px',
                                    }}>
                                        🎙️ Start Recording
                                    </button>
                                    <button onClick={skipQuestion} style={{
                                        padding: '14px 20px', borderRadius: '999px',
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem',
                                        cursor: 'pointer', transition: 'all 0.3s',
                                    }}>
                                        Skip ⏩
                                    </button>
                                </>
                            ) : (
                                /* During recording: Stop button */
                                <motion.button
                                    onClick={stopRecording}
                                    animate={{ boxShadow: ['0 0 0 0 rgba(239,68,68,0.4)', '0 0 0 12px rgba(239,68,68,0)', '0 0 0 0 rgba(239,68,68,0.4)'] }}
                                    transition={{ repeat: Infinity, duration: 1.5 }}
                                    style={{
                                        padding: '14px 32px', borderRadius: '999px',
                                        background: 'linear-gradient(135deg, #dc2626, #ef4444)',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        color: 'white', fontWeight: 600, fontSize: '0.9rem',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                                    }}
                                >
                                    ⏹ Stop Recording
                                </motion.button>
                            )}
                        </div>

                        {/* Progress Dots */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '1.5rem' }}>
                            {questions.map((_, i) => (
                                <div key={i} style={{
                                    width: i === currentQuestion ? '24px' : '8px',
                                    height: '8px', borderRadius: '99px',
                                    background: i < currentQuestion ? '#4ade80' : i === currentQuestion ? '#8b5cf6' : 'rgba(255,255,255,0.1)',
                                    transition: 'all 0.3s',
                                }} />
                            ))}
                        </div>
                    </motion.div>

                    {/* Tip */}
                    <motion.p
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                        style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.75rem', marginTop: '1.5rem', textAlign: 'center', maxWidth: '500px' }}
                    >
                        💡 Speak naturally — your voice will be used to clone your twin&apos;s speech. Minimum 5 voice-recorded answers required.
                    </motion.p>
                </div>
            </div>
        );
    }

    // GENERATING STEP — Premium Gen Z AI Animation
    const GENERATION_STAGES = [
        { icon: "🔍", label: "Scanning social profiles", sub: "Extracting digital footprint" },
        { icon: "🧬", label: "Analyzing voice DNA", sub: "Building speech patterns" },
        { icon: "🧠", label: "Training neural pathways", sub: "Learning personality traits" },
        { icon: "🎨", label: "Generating avatar", sub: "Converting to digital form" },
        { icon: "⚡", label: "Syncing consciousness", sub: "Final calibration" },
        { icon: "✨", label: "Almost ready", sub: "Your twin is awakening" },
    ];
    const currentStageIdx = Math.min(Math.floor(generatingProgress / (100 / GENERATION_STAGES.length)), GENERATION_STAGES.length - 1);
    const currentStage = GENERATION_STAGES[currentStageIdx];

    return (
        <div style={{ height: '100vh', overflow: 'hidden', position: 'relative', background: '#07080d' }}>
            {/* Deep space background */}
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 30%, rgba(99,102,241,0.15) 0%, rgba(7,8,13,1) 70%)' }} />
            
            {/* Animated grid */}
            <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: 'linear-gradient(rgba(139,92,246,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.04) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
                animation: 'gridMove 20s linear infinite',
            }} />

            {/* Floating particles */}
            {Array.from({ length: 30 }).map((_, i) => (
                <motion.div
                    key={`gen-p-${i}`}
                    animate={{
                        y: [0, -600],
                        x: [0, (Math.random() - 0.5) * 150],
                        opacity: [0, 0.6, 0],
                    }}
                    transition={{ repeat: Infinity, duration: 3 + Math.random() * 4, delay: Math.random() * 5, ease: 'linear' }}
                    style={{
                        position: 'absolute', bottom: '-10px',
                        left: `${5 + Math.random() * 90}%`,
                        width: `${2 + Math.random() * 3}px`,
                        height: `${2 + Math.random() * 3}px`,
                        borderRadius: '50%',
                        background: ['#8b5cf6', '#6366f1', '#3b82f6', '#06b6d4', '#ec4899'][i % 5],
                        pointerEvents: 'none',
                    }}
                />
            ))}

            {/* Main content */}
            <div style={{ position: 'relative', zIndex: 10, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>

                {/* Avatar Morphing Container */}
                <div style={{ position: 'relative', width: '200px', height: '200px', marginBottom: '2.5rem' }}>
                    {/* Outer scanning ring */}
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                        style={{
                            position: 'absolute', inset: '-20px',
                            borderRadius: '50%',
                            border: '2px solid transparent',
                            borderTopColor: '#8b5cf6',
                            borderRightColor: '#ec4899',
                        }}
                    />
                    <motion.div
                        animate={{ rotate: -360 }}
                        transition={{ repeat: Infinity, duration: 5, ease: 'linear' }}
                        style={{
                            position: 'absolute', inset: '-35px',
                            borderRadius: '50%',
                            border: '1px dashed rgba(139,92,246,0.3)',
                        }}
                    />
                    {/* Inner glow */}
                    <motion.div
                        animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
                        transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
                        style={{
                            position: 'absolute', inset: '-10px',
                            borderRadius: '50%',
                            background: 'radial-gradient(circle, rgba(139,92,246,0.3) 0%, transparent 70%)',
                            filter: 'blur(15px)',
                        }}
                    />
                    {/* Avatar image with transformation effect */}
                    <div style={{
                        width: '200px', height: '200px', borderRadius: '50%',
                        overflow: 'hidden', position: 'relative',
                        border: '3px solid rgba(139,92,246,0.5)',
                        boxShadow: '0 0 40px rgba(139,92,246,0.4), 0 0 80px rgba(99,102,241,0.2)',
                    }}>
                        {capturedPhotos[0] ? (
                            <>
                                <img
                                    src={capturedPhotos[0]}
                                    alt="Your photo"
                                    style={{
                                        width: '100%', height: '100%', objectFit: 'cover',
                                        filter: generatingProgress > 60 ? 'saturate(1.5) contrast(1.2)' : 'none',
                                        transition: 'filter 2s ease',
                                    }}
                                />
                                {/* Scanning line effect */}
                                <motion.div
                                    animate={{ top: ['-20%', '120%'] }}
                                    transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                                    style={{
                                        position: 'absolute', left: 0, right: 0,
                                        height: '4px',
                                        background: 'linear-gradient(90deg, transparent, #8b5cf6, #ec4899, transparent)',
                                        boxShadow: '0 0 20px rgba(139,92,246,0.6)',
                                        pointerEvents: 'none',
                                    }}
                                />
                                {/* Holographic overlay */}
                                <motion.div
                                    animate={{ opacity: [0.1, 0.3, 0.1] }}
                                    transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                                    style={{
                                        position: 'absolute', inset: 0,
                                        background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(236,72,153,0.1), rgba(99,102,241,0.2))',
                                        mixBlendMode: 'overlay' as const,
                                    }}
                                />
                            </>
                        ) : (
                            <div style={{
                                width: '100%', height: '100%',
                                background: 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.3))',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '4rem',
                            }}>🧠</div>
                        )}
                    </div>

                    {/* Orbiting data nodes */}
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                        <motion.div
                            key={`node-${i}`}
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 6 + i, ease: 'linear' }}
                            style={{ position: 'absolute', top: '50%', left: '50%', width: 0, height: 0 }}
                        >
                            <motion.div
                                animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.5, 1, 0.5] }}
                                transition={{ repeat: Infinity, duration: 2, delay: i * 0.3 }}
                                style={{
                                    position: 'absolute',
                                    top: -120 * Math.sin((i / 6) * 2 * Math.PI) - 5,
                                    left: 120 * Math.cos((i / 6) * 2 * Math.PI) - 5,
                                    width: '10px', height: '10px',
                                    borderRadius: '50%',
                                    background: ['#8b5cf6', '#ec4899', '#3b82f6', '#06b6d4', '#f59e0b', '#4ade80'][i],
                                    boxShadow: `0 0 10px ${['#8b5cf6', '#ec4899', '#3b82f6', '#06b6d4', '#f59e0b', '#4ade80'][i]}`,
                                }}
                            />
                        </motion.div>
                    ))}
                </div>

                {/* Title */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ textAlign: 'center', marginBottom: '2rem' }}
                >
                    <h1 style={{
                        fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
                        fontWeight: 700, color: 'white',
                        letterSpacing: '-0.03em', marginBottom: '0.5rem',
                    }}>
                        Creating Your{' '}
                        <span style={{
                            background: 'linear-gradient(135deg, #8b5cf6, #ec4899, #6366f1)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        }}>Digital Twin</span>
                    </h1>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>
                        Assembling your AI consciousness
                    </p>
                </motion.div>

                {/* Current Stage Card */}
                <motion.div
                    key={currentStageIdx}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.4 }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '16px',
                        padding: '1rem 2rem', borderRadius: '20px',
                        background: 'rgba(20,22,30,0.6)', backdropFilter: 'blur(20px)',
                        border: '1px solid rgba(139,92,246,0.25)',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
                        marginBottom: '1.5rem', minWidth: '340px',
                    }}
                >
                    <motion.span
                        animate={{ scale: [1, 1.3, 1] }}
                        transition={{ repeat: Infinity, duration: 1.5 }}
                        style={{ fontSize: '2rem' }}
                    >{currentStage.icon}</motion.span>
                    <div>
                        <p style={{ color: 'white', fontWeight: 600, fontSize: '1rem' }}>{currentStage.label}</p>
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>{currentStage.sub}</p>
                    </div>
                </motion.div>

                {/* Progress Ring */}
                <div style={{ position: 'relative', width: '80px', height: '80px', marginBottom: '1.5rem' }}>
                    <svg width="80" height="80" style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx="40" cy="40" r="35" stroke="rgba(255,255,255,0.06)" strokeWidth="4" fill="none" />
                        <motion.circle
                            cx="40" cy="40" r="35"
                            stroke="url(#progressGrad)" strokeWidth="4" fill="none"
                            strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 35}`}
                            animate={{ strokeDashoffset: `${2 * Math.PI * 35 * (1 - generatingProgress / 100)}` }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                        />
                        <defs>
                            <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#8b5cf6" />
                                <stop offset="100%" stopColor="#ec4899" />
                            </linearGradient>
                        </defs>
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white', fontFamily: 'monospace' }}>
                            {Math.round(generatingProgress)}%
                        </span>
                    </div>
                </div>

                {/* Stage progress dots */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
                    {GENERATION_STAGES.map((_, i) => (
                        <motion.div
                            key={i}
                            animate={{
                                background: i <= currentStageIdx
                                    ? 'linear-gradient(135deg, #8b5cf6, #ec4899)'
                                    : 'rgba(255,255,255,0.08)',
                                scale: i === currentStageIdx ? [1, 1.3, 1] : 1,
                            }}
                            transition={{
                                scale: { repeat: Infinity, duration: 1 },
                                background: { duration: 0.5 },
                            }}
                            style={{
                                width: i === currentStageIdx ? '24px' : '8px',
                                height: '8px', borderRadius: '99px',
                                transition: 'width 0.3s',
                            }}
                        />
                    ))}
                </div>

                {/* Bottom text */}
                <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.7rem', textAlign: 'center', maxWidth: '400px' }}>
                    🔒 All processing happens locally on your device. Your data never leaves this machine.
                </p>
            </div>

            {/* CSS for grid animation */}
            <style>{`
                @keyframes gridMove {
                    0% { transform: translate(0, 0); }
                    100% { transform: translate(40px, 40px); }
                }
            `}</style>
        </div>
    );
}
