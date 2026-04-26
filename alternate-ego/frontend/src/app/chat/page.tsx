"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    sendMessage,
    exportConversation,
    listConversations,
    loadConversationMessages,
    generateVideoAvatar,
} from "@/lib/api";

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    sources?: Array<{
        icon: string;
        label: string;
        text: string;
        url: string;
        relevance: number;
        type: string;
    }>;
    mood?: string;
    audio_url?: string;
    timestamp?: string;
}

interface Conversation {
    id: string;
    created_at: string;
    message_count?: number;
}

const MOOD_CONFIG: Record<string, { emoji: string; color: string; glow: string; label: string }> = {
    happy: { emoji: "😊", color: "#4ade80", glow: "rgba(74,222,128,0.4)", label: "Happy" },
    excited: { emoji: "🤩", color: "#f59e0b", glow: "rgba(245,158,11,0.4)", label: "Excited" },
    sad: { emoji: "😢", color: "#60a5fa", glow: "rgba(96,165,250,0.4)", label: "Sad" },
    angry: { emoji: "😠", color: "#f87171", glow: "rgba(248,113,113,0.4)", label: "Angry" },
    thoughtful: { emoji: "🤔", color: "#a78bfa", glow: "rgba(167,139,250,0.4)", label: "Thinking" },
    neutral: { emoji: "😐", color: "#94a3b8", glow: "rgba(148,163,184,0.3)", label: "Neutral" },
};

export default function ChatPage() {
    const router = useRouter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [session, setSession] = useState<any>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [conversationId, setConversationId] = useState("");
    const [currentMood, setCurrentMood] = useState("neutral");
    const [showSources, setShowSources] = useState<string | null>(null);
    const [avatarKey, setAvatarKey] = useState(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Conversation sidebar
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loadingConversations, setLoadingConversations] = useState(false);

    // Video avatar
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [generatingVideo, setGeneratingVideo] = useState(false);
    const [showVideo, setShowVideo] = useState(false);

    useEffect(() => {
        const sessionData = localStorage.getItem("ego_session");
        if (!sessionData) {
            router.push("/");
            return;
        }
        setSession(JSON.parse(sessionData));
    }, [router]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Load conversation list when sidebar opens
    const loadConversations = useCallback(async () => {
        if (!session?.twin_id) return;
        setLoadingConversations(true);
        try {
            const data = await listConversations(session.twin_id);
            setConversations(data.conversations || []);
        } catch (e) {
            console.error("Failed to load conversations:", e);
        } finally {
            setLoadingConversations(false);
        }
    }, [session]);

    useEffect(() => {
        if (sidebarOpen && session) {
            loadConversations();
        }
    }, [sidebarOpen, session, loadConversations]);

    const switchConversation = async (convId: string) => {
        if (!session?.twin_id || convId === conversationId) return;
        try {
            const data = await loadConversationMessages(session.twin_id, convId);
            const msgs: Message[] = (data.messages || []).map((m: Record<string, string>, i: number) => ({
                id: `${convId}-${i}`,
                role: m.role as "user" | "assistant",
                content: m.content,
                mood: m.mood || "neutral",
                timestamp: m.created_at
                    ? new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : "",
            }));
            setMessages(msgs);
            setConversationId(convId);
            setSidebarOpen(false);
            if (msgs.length > 0) {
                const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
                if (lastAssistant?.mood) setCurrentMood(lastAssistant.mood);
            }
        } catch (e) {
            console.error("Failed to load conversation:", e);
        }
    };

    const newConversation = () => {
        setMessages([]);
        setConversationId("");
        setCurrentMood("neutral");
        setAvatarKey((k) => k + 1);
        setSidebarOpen(false);
    };

    const handleSend = async () => {
        if (!input.trim() || loading || !session) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: "user",
            content: input.trim(),
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setLoading(true);

        try {
            const result = await sendMessage({
                twin_id: session.twin_id,
                message: userMessage.content,
                conversation_id: conversationId,
            });

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: result.reply,
                sources: result.sources || [],
                mood: result.mood || "neutral",
                audio_url: result.audio_url || "",
                timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            };

            setMessages((prev) => [...prev, assistantMessage]);
            setCurrentMood(result.mood || "neutral");
            setAvatarKey((k) => k + 1);

            if (result.conversation_id && !conversationId) {
                setConversationId(result.conversation_id);
            }

            if (result.audio_url) {
                playAudio(result.audio_url, assistantMessage.id);
            }
        } catch {
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: "Sorry, I couldn't connect to my brain. Make sure the backend server and Ollama are running.",
                mood: "sad",
                timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            };
            setMessages((prev) => [...prev, errorMsg]);
        } finally {
            setLoading(false);
            inputRef.current?.focus();
        }
    };

    const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const playAudio = (url: string, msgId?: string) => {
        if (!url) return;
        try {
            // Stop any currently playing audio
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
            
            const fullUrl = url.startsWith("http") ? url : `http://localhost:8000${url}`;
            const audio = new Audio(fullUrl);
            audio.volume = 0.85;
            audioRef.current = audio;
            
            if (msgId) setPlayingAudioId(msgId);
            
            audio.onended = () => {
                setPlayingAudioId(null);
                audioRef.current = null;
            };
            audio.onerror = () => {
                setPlayingAudioId(null);
                audioRef.current = null;
            };
            
            audio.play().catch((e) => {
                console.warn("Audio autoplay blocked:", e);
                setPlayingAudioId(null);
            });
        } catch (e) {
            console.warn("Audio failed:", e);
            setPlayingAudioId(null);
        }
    };

    const stopAudio = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        setPlayingAudioId(null);
    };

    const handleGenerateVideo = async () => {
        if (!session || generatingVideo) return;
        const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
        if (!lastAssistant) return;

        setGeneratingVideo(true);
        try {
            const result = await generateVideoAvatar(session.twin_id, lastAssistant.content.slice(0, 200));
            if (result.video_url) {
                setVideoUrl(`http://localhost:8000${result.video_url}`);
                setShowVideo(true);
            }
        } catch (e) {
            console.error("Video generation failed:", e);
        } finally {
            setGeneratingVideo(false);
        }
    };

    const handleExportPDF = () => {
        if (!session) return;
        window.open(`http://localhost:8000/api/chat/export-pdf/${session.twin_id}`, "_blank");
    };

    const handleExportJSON = async () => {
        if (!session) return;
        const data = await exportConversation(session.twin_id, conversationId);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ego_export_${session.name}.json`;
        a.click();
    };

    const getAvatarUrl = () => {
        if (!session?.twin_id) return "";
        const emotionMap: Record<string, string> = {
            happy: "happy", excited: "happy", sad: "sad",
            angry: "angry", neutral: "neutral", thoughtful: "neutral",
        };
        const emotion = emotionMap[currentMood] || "neutral";
        // Prefer cartoon avatar version (.png)
        return `http://localhost:8000/static/storage/avatars/${session.twin_id}/${emotion}_avatar.png`;
    };

    const getRawAvatarUrl = () => {
        if (!session?.twin_id) return "";
        return `http://localhost:8000/static/storage/avatars/${session.twin_id}/original.jpg`;
    };

    const mood = MOOD_CONFIG[currentMood] || MOOD_CONFIG.neutral;

    if (!session) {
        return (
            <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#07080d" }}>
                <div className="spinner" />
            </div>
        );
    }

    return (
        <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#07080d", overflow: "hidden" }}>

            {/* ═══ VIDEO MODAL ═══ */}
            <AnimatePresence>
                {showVideo && videoUrl && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: "fixed", inset: 0, zIndex: 1000,
                            background: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                        onClick={() => setShowVideo(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.85, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.85, opacity: 0 }}
                            transition={{ type: "spring", bounce: 0.3 }}
                            style={{
                                background: "rgba(15,17,25,0.95)",
                                border: "1px solid rgba(139,92,246,0.3)",
                                borderRadius: "24px",
                                padding: "24px",
                                maxWidth: "600px",
                                width: "90vw",
                                boxShadow: "0 0 60px rgba(139,92,246,0.2)",
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                                <h3 style={{ color: "white", fontWeight: 600 }}>🎬 Video Avatar</h3>
                                <button
                                    onClick={() => setShowVideo(false)}
                                    style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: "1.2rem" }}
                                >✕</button>
                            </div>
                            <video
                                src={videoUrl}
                                controls
                                autoPlay
                                style={{ width: "100%", borderRadius: "16px", background: "#000" }}
                            />
                            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.75rem", marginTop: "12px", textAlign: "center" }}>
                                Lip-synced video of your twin speaking
                            </p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ CONVERSATION SIDEBAR ═══ */}
            <AnimatePresence>
                {sidebarOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.5)" }}
                            onClick={() => setSidebarOpen(false)}
                        />
                        <motion.div
                            initial={{ x: -320, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: -320, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            style={{
                                position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 100,
                                width: "300px",
                                background: "rgba(10,12,20,0.98)",
                                backdropFilter: "blur(30px)",
                                borderRight: "1px solid rgba(255,255,255,0.08)",
                                display: "flex", flexDirection: "column",
                                boxShadow: "8px 0 40px rgba(0,0,0,0.5)",
                            }}
                        >
                            {/* Sidebar Header */}
                            <div style={{
                                padding: "20px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                            }}>
                                <div>
                                    <h3 style={{ color: "white", fontWeight: 600, fontSize: "1rem" }}>💬 Conversations</h3>
                                    <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.7rem", marginTop: "2px" }}>{session.name}&apos;s chat history</p>
                                </div>
                                <button
                                    onClick={() => setSidebarOpen(false)}
                                    style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: "1.1rem" }}
                                >✕</button>
                            </div>

                            {/* New Conversation Button */}
                            <div style={{ padding: "12px 16px" }}>
                                <button
                                    onClick={newConversation}
                                    style={{
                                        width: "100%", padding: "10px 16px", borderRadius: "12px",
                                        background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(99,102,241,0.2))",
                                        border: "1px solid rgba(139,92,246,0.3)",
                                        color: "#a78bfa", cursor: "pointer", fontSize: "0.8rem",
                                        fontWeight: 600, display: "flex", alignItems: "center", gap: "8px",
                                        justifyContent: "center", transition: "all 0.2s",
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(139,92,246,0.3)"; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(99,102,241,0.2))"; }}
                                >
                                    ✨ New Conversation
                                </button>
                            </div>

                            {/* Conversation List */}
                            <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
                                {loadingConversations ? (
                                    <div style={{ textAlign: "center", padding: "2rem", color: "rgba(255,255,255,0.3)", fontSize: "0.8rem" }}>
                                        <div className="spinner" style={{ margin: "0 auto 8px" }} />
                                        Loading conversations...
                                    </div>
                                ) : conversations.length === 0 ? (
                                    <div style={{ textAlign: "center", padding: "2rem", color: "rgba(255,255,255,0.25)", fontSize: "0.8rem" }}>
                                        No past conversations yet.<br />Start chatting to create one!
                                    </div>
                                ) : (
                                    conversations.map((conv, i) => {
                                        const isActive = conv.id === conversationId;
                                        const date = conv.created_at
                                            ? new Date(conv.created_at).toLocaleDateString([], { month: "short", day: "numeric" })
                                            : `Chat ${i + 1}`;
                                        const time = conv.created_at
                                            ? new Date(conv.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                                            : "";
                                        return (
                                            <motion.button
                                                key={conv.id}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.05 }}
                                                onClick={() => switchConversation(conv.id)}
                                                style={{
                                                    width: "100%", padding: "12px 14px",
                                                    borderRadius: "12px", marginBottom: "6px",
                                                    background: isActive ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.03)",
                                                    border: isActive ? "1px solid rgba(139,92,246,0.35)" : "1px solid rgba(255,255,255,0.05)",
                                                    color: "white", cursor: "pointer",
                                                    textAlign: "left", transition: "all 0.2s",
                                                    display: "flex", alignItems: "center", gap: "10px",
                                                }}
                                                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                                                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                                            >
                                                <span style={{ fontSize: "1.2rem" }}>💬</span>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: "0.82rem", fontWeight: 500, color: isActive ? "#a78bfa" : "rgba(255,255,255,0.8)" }}>
                                                        {date}
                                                    </div>
                                                    <div style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.3)", marginTop: "2px" }}>{time}</div>
                                                </div>
                                                {isActive && (
                                                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#8b5cf6", flexShrink: 0 }} />
                                                )}
                                            </motion.button>
                                        );
                                    })
                                )}
                            </div>

                            {/* Sidebar Footer */}
                            <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                                <button
                                    onClick={() => router.push("/memory")}
                                    style={{
                                        width: "100%", padding: "8px", borderRadius: "10px",
                                        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
                                        color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: "0.75rem",
                                        transition: "all 0.2s",
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.color = "white"; e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.4)"; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                                >🧠 Memory Graph</button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ═══ HEADER BAR ═══ */}
            <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 24px",
                background: "rgba(12,14,22,0.8)",
                backdropFilter: "blur(20px)",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                zIndex: 50,
            }}>
                {/* Left: Sidebar Toggle + Brand */}
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <button
                        onClick={() => setSidebarOpen(true)}
                        title="Chat History"
                        style={{
                            padding: "8px 10px", borderRadius: "10px",
                            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                            color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: "1rem",
                            transition: "all 0.2s", display: "flex", flexDirection: "column", gap: "4px",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(139,92,246,0.2)"; e.currentTarget.style.color = "white"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
                    >
                        <span style={{ width: "16px", height: "2px", background: "currentColor", display: "block", borderRadius: "2px" }} />
                        <span style={{ width: "12px", height: "2px", background: "currentColor", display: "block", borderRadius: "2px" }} />
                        <span style={{ width: "16px", height: "2px", background: "currentColor", display: "block", borderRadius: "2px" }} />
                    </button>
                    <motion.div animate={{ rotate: [0, 360] }} transition={{ repeat: Infinity, duration: 20, ease: "linear" }} style={{ fontSize: "1.5rem" }}>🧠</motion.div>
                    <div>
                        <h1 style={{ fontSize: "1.2rem", fontWeight: 700, color: "white", background: "linear-gradient(135deg, #8b5cf6, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                            Alternate Ego
                        </h1>
                        <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.3)", letterSpacing: "0.15em", textTransform: "uppercase" }}>
                            {conversationId ? `conv #${conversationId.slice(0, 6)}` : "new conversation"}
                        </p>
                    </div>
                </div>

                {/* Center: Status */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 8px #4ade80", animation: "pulse 2s infinite" }} />
                    <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>Online</span>
                </div>

                {/* Right: Actions */}
                <div style={{ display: "flex", gap: "8px" }}>
                    <button
                        onClick={handleGenerateVideo}
                        disabled={generatingVideo || messages.filter(m => m.role === "assistant").length === 0}
                        title="Generate lip-synced video"
                        style={{
                            padding: "8px 12px", borderRadius: "10px",
                            background: generatingVideo ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            color: generatingVideo ? "#a78bfa" : "rgba(255,255,255,0.6)",
                            cursor: generatingVideo ? "not-allowed" : "pointer",
                            fontSize: "0.75rem", transition: "all 0.2s", display: "flex", alignItems: "center", gap: "6px",
                        }}
                        onMouseEnter={(e) => { if (!generatingVideo) { e.currentTarget.style.background = "rgba(99,102,241,0.2)"; e.currentTarget.style.color = "white"; }}}
                        onMouseLeave={(e) => { if (!generatingVideo) { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}}
                    >
                        {generatingVideo ? "⏳ Generating..." : "🎬 Video"}
                    </button>
                    <button onClick={handleExportPDF} title="Export PDF" style={{ padding: "8px 12px", borderRadius: "10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: "0.75rem", transition: "all 0.2s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(139,92,246,0.2)"; e.currentTarget.style.color = "white"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
                    >📄 Export</button>
                    <button onClick={() => router.push("/")} title="Home" style={{ padding: "8px 12px", borderRadius: "10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: "0.75rem", transition: "all 0.2s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "white"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
                    >🏠</button>
                </div>
            </div>

            {/* ═══ MAIN SPLIT ═══ */}
            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

                {/* ═══ LEFT: Avatar Panel ═══ */}
                <div style={{
                    width: "300px", flexShrink: 0,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    padding: "2rem 1.5rem",
                    background: "rgba(12,14,22,0.5)",
                    borderRight: "1px solid rgba(255,255,255,0.05)",
                    position: "relative", overflow: "hidden",
                }}>
                    {/* Mood glow background */}
                    <motion.div
                        key={`glow-${avatarKey}`}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8 }}
                        style={{
                            position: "absolute", top: "30%", left: "50%", transform: "translate(-50%, -50%)",
                            width: "300px", height: "300px", borderRadius: "50%",
                            background: `radial-gradient(circle, ${mood.glow} 0%, transparent 70%)`,
                            pointerEvents: "none", filter: "blur(40px)",
                        }}
                    />

                    {/* Avatar Card */}
                    <motion.div style={{ position: "relative", zIndex: 10, textAlign: "center" }} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6 }}>
                        {/* Avatar Image with Mood Border */}
                        <motion.div
                            key={`avatar-${avatarKey}`}
                            initial={{ scale: 0.85, opacity: 0.3, rotate: -5 }}
                            animate={{ scale: 1, opacity: 1, rotate: 0 }}
                            transition={{ type: "spring", stiffness: 200, damping: 15, mass: 0.8 }}
                            style={{
                                width: "170px", height: "210px", borderRadius: "24px",
                                overflow: "hidden", margin: "0 auto",
                                border: `3px solid ${mood.color}`,
                                boxShadow: `0 0 30px ${mood.glow}, 0 0 60px ${mood.glow}, 0 20px 40px rgba(0,0,0,0.5)`,
                                transition: "border-color 0.5s, box-shadow 0.8s",
                                position: "relative",
                                cursor: videoUrl ? "pointer" : "default",
                            }}
                            onClick={() => { if (videoUrl) setShowVideo(true); }}
                        >
                            <img
                                src={getAvatarUrl()}
                                alt="Twin Avatar"
                                onError={(e) => { 
                                    const img = e.target as HTMLImageElement;
                                    const rawUrl = getRawAvatarUrl();
                                    if (img.src !== rawUrl) {
                                        img.src = rawUrl;
                                    } else {
                                        img.style.display = "none";
                                    }
                                }}
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                            {/* Video play overlay */}
                            {videoUrl && (
                                <div style={{
                                    position: "absolute", inset: 0,
                                    background: "rgba(0,0,0,0.4)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    opacity: 0, transition: "opacity 0.2s",
                                }}
                                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0"; }}
                                >
                                    <span style={{ fontSize: "2.5rem" }}>▶️</span>
                                </div>
                            )}
                            {/* Fallback gradient */}
                            <div style={{
                                position: "absolute", inset: 0,
                                background: "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.3))",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: "4rem", zIndex: -1,
                            }}>🧠</div>
                        </motion.div>

                        {/* Mood Badge */}
                        <motion.div
                            key={`mood-${avatarKey}`}
                            initial={{ scale: 0, y: 10 }}
                            animate={{ scale: 1, y: 0 }}
                            transition={{ type: "spring", bounce: 0.5, delay: 0.2 }}
                            style={{
                                position: "absolute", bottom: "-8px", left: "50%", transform: "translateX(-50%)",
                                background: "rgba(12,14,22,0.9)", backdropFilter: "blur(12px)",
                                border: `2px solid ${mood.color}`,
                                borderRadius: "999px", padding: "6px 16px",
                                display: "flex", alignItems: "center", gap: "6px",
                                boxShadow: `0 4px 15px ${mood.glow}`,
                            }}
                        >
                            <span style={{ fontSize: "1.1rem" }}>{mood.emoji}</span>
                            <span style={{ fontSize: "0.7rem", color: mood.color, fontWeight: 600, letterSpacing: "0.05em" }}>{mood.label}</span>
                        </motion.div>
                    </motion.div>

                    {/* Twin Name */}
                    <div style={{ marginTop: "2rem", textAlign: "center", zIndex: 10 }}>
                        <h3 style={{ color: "white", fontSize: "1.2rem", fontWeight: 600 }}>{session.name}</h3>
                        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.75rem", marginTop: "4px" }}>Digital Twin • AI Clone</p>
                    </div>

                    {/* Stats Pills */}
                    <div style={{ display: "flex", gap: "8px", marginTop: "1.5rem", flexWrap: "wrap", justifyContent: "center", zIndex: 10 }}>
                        <div style={{ padding: "6px 14px", borderRadius: "999px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "0.7rem", color: "rgba(255,255,255,0.4)" }}>
                            💬 {messages.length} msgs
                        </div>
                        <div style={{ padding: "6px 14px", borderRadius: "999px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "0.7rem", color: "rgba(255,255,255,0.4)" }}>
                            🧠 RAG Active
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div style={{ marginTop: "auto", paddingTop: "1.5rem", display: "flex", flexDirection: "column", gap: "8px", width: "100%", zIndex: 10 }}>
                        <button
                            onClick={() => { setSidebarOpen(true); }}
                            style={{ width: "100%", padding: "10px", borderRadius: "12px", background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", color: "#a78bfa", cursor: "pointer", fontSize: "0.75rem", transition: "all 0.2s", textAlign: "center" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(139,92,246,0.2)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(139,92,246,0.08)"; }}
                        >📋 All Conversations</button>
                        <button
                            onClick={handleExportJSON}
                            style={{ width: "100%", padding: "10px", borderRadius: "12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: "0.75rem", transition: "all 0.2s", textAlign: "center" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(139,92,246,0.15)"; e.currentTarget.style.borderColor = "rgba(139,92,246,0.3)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                        >📥 Export JSON</button>
                        <button
                            onClick={() => router.push("/upload")}
                            style={{ width: "100%", padding: "10px", borderRadius: "12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: "0.75rem", transition: "all 0.2s", textAlign: "center" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.15)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                        >🔄 New Twin</button>
                    </div>
                </div>

                {/* ═══ RIGHT: Chat Window ═══ */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>

                    {/* Chat background pattern */}
                    <div style={{
                        position: "absolute", inset: 0, opacity: 0.03, pointerEvents: "none",
                        backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
                    }} />

                    {/* Messages */}
                    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", position: "relative" }}>
                        {messages.length === 0 && (
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: "center", paddingTop: "15vh" }}>
                                <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }} style={{ fontSize: "4rem", marginBottom: "1rem" }}>🧠</motion.div>
                                <h2 style={{ fontSize: "1.5rem", fontWeight: 600, background: "linear-gradient(135deg, #8b5cf6, #ec4899, #6366f1)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: "0.5rem" }}>
                                    Start chatting with your twin
                                </h2>
                                <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.85rem", maxWidth: "400px", margin: "0 auto" }}>
                                    Ask anything — &quot;Who are you?&quot;, &quot;Tell me about your interests&quot;, or &quot;What motivates you?&quot;
                                </p>
                                <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "1.5rem", flexWrap: "wrap" }}>
                                    {["Hi, who are you?", "Tell me about your passions", "What's your biggest goal?"].map((q) => (
                                        <button key={q} onClick={() => { setInput(q); }} style={{ padding: "8px 16px", borderRadius: "999px", background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: "0.8rem", transition: "all 0.2s" }}
                                            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(139,92,246,0.25)"; e.currentTarget.style.color = "white"; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(139,92,246,0.1)"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
                                        >{q}</button>
                                    ))}
                                </div>
                                <p style={{ color: "rgba(255,255,255,0.15)", fontSize: "0.7rem", marginTop: "1.5rem" }}>
                                    Slash commands: /linkedin post &lt;content&gt; • /twitter tweet &lt;content&gt; • /schedule • /autoreply • /help
                                </p>
                            </motion.div>
                        )}

                        <AnimatePresence>
                            {messages.map((msg) => (
                                <motion.div
                                    key={msg.id}
                                    initial={{ opacity: 0, y: 15, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={{ duration: 0.3, type: "spring", bounce: 0.2 }}
                                    style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: "16px" }}
                                >
                                    {/* Twin avatar small circle */}
                                    {msg.role === "assistant" && (
                                        <div style={{ width: "32px", height: "32px", borderRadius: "50%", overflow: "hidden", flexShrink: 0, marginRight: "10px", marginTop: "4px", border: `2px solid ${(MOOD_CONFIG[msg.mood || "neutral"]).color}40` }}>
                                            <img src={getAvatarUrl()} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.target as HTMLImageElement).src = ""; }} />
                                        </div>
                                    )}

                                    <div style={{ maxWidth: "65%" }}>
                                        {/* Message Bubble */}
                                        <div style={{
                                            padding: "12px 18px",
                                            borderRadius: msg.role === "user" ? "20px 20px 4px 20px" : "20px 20px 20px 4px",
                                            background: msg.role === "user" ? "linear-gradient(135deg, #5b2da0, #7c3aed)" : "rgba(20,22,34,0.8)",
                                            border: msg.role === "user" ? "none" : "1px solid rgba(255,255,255,0.06)",
                                            color: "white", fontSize: "0.9rem", lineHeight: "1.5",
                                            boxShadow: msg.role === "user" ? "0 4px 15px rgba(124,58,237,0.3)" : "0 2px 10px rgba(0,0,0,0.3)",
                                            backdropFilter: msg.role === "assistant" ? "blur(12px)" : undefined,
                                        }}>
                                            {msg.content}
                                        </div>

                                        {/* Timestamp + Actions */}
                                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px", padding: "0 4px", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                                            <span style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.2)" }}>{msg.timestamp}</span>
                                            {msg.role === "user" && <span style={{ fontSize: "0.6rem", color: "#8b5cf6" }}>✓✓</span>}
                                            {msg.role === "assistant" && msg.audio_url && (
                                                playingAudioId === msg.id ? (
                                                    <button onClick={stopAudio} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '3px', transition: 'opacity 0.2s' }}>
                                                        ⏹ Stop
                                                    </button>
                                                ) : (
                                                    <button onClick={() => playAudio(msg.audio_url!, msg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '3px', transition: 'opacity 0.2s' }}
                                                        onMouseEnter={(e) => e.currentTarget.style.opacity = "0.7"}
                                                        onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
                                                    >🔊 Play Voice</button>
                                                )
                                            )}
                                            {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                                                <button onClick={() => setShowSources(showSources === msg.id ? null : msg.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.65rem", color: "rgba(255,255,255,0.25)", transition: "color 0.2s" }}
                                                    onMouseEnter={(e) => e.currentTarget.style.color = "rgba(255,255,255,0.6)"}
                                                    onMouseLeave={(e) => e.currentTarget.style.color = "rgba(255,255,255,0.25)"}
                                                >📚 {msg.sources.length} sources</button>
                                            )}
                                        </div>

                                        {/* Expanded Sources */}
                                        <AnimatePresence>
                                            {showSources === msg.id && msg.sources && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: "auto" }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    style={{ marginTop: "8px", padding: "10px 14px", background: "rgba(20,22,34,0.6)", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}
                                                >
                                                    {msg.sources.map((src, i) => (
                                                        <div key={i} style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", display: "flex", gap: "6px", marginBottom: "4px" }}>
                                                            <span>{src.icon}</span>
                                                            <span>{src.label}: <span style={{ color: "rgba(255,255,255,0.55)" }}>{src.text}</span></span>
                                                        </div>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {/* Typing Indicator */}
                        <AnimatePresence>
                            {loading && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                                    <div style={{ width: "32px", height: "32px", borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: "2px solid rgba(139,92,246,0.3)" }}>
                                        <img src={getAvatarUrl()} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.target as HTMLImageElement).src = ""; }} />
                                    </div>
                                    <div style={{ padding: "14px 20px", borderRadius: "20px 20px 20px 4px", background: "rgba(20,22,34,0.8)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: "10px" }}>
                                        <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)" }}>{session.name}&apos;s twin is thinking</span>
                                        <div style={{ display: "flex", gap: "4px" }}>
                                            {[0, 1, 2].map((i) => (
                                                <motion.span key={i} animate={{ y: [0, -6, 0], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: i * 0.15 }} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#8b5cf6", display: "block" }} />
                                            ))}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div ref={messagesEndRef} />
                    </div>

                    {/* ═══ INPUT BAR ═══ */}
                    <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(12,14,22,0.6)", backdropFilter: "blur(20px)" }}>
                        <div style={{ display: "flex", gap: "12px", maxWidth: "800px", margin: "0 auto", alignItems: "center" }}>
                            <input
                                ref={inputRef}
                                id="chat-input"
                                type="text"
                                placeholder="Type a message..."
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                                disabled={loading}
                                autoFocus
                                style={{
                                    flex: 1, padding: "14px 22px",
                                    background: "rgba(255,255,255,0.06)",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    borderRadius: "999px", color: "white",
                                    fontSize: "0.9rem", outline: "none", transition: "all 0.3s",
                                }}
                                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(139,92,246,0.4)"; e.currentTarget.style.boxShadow = "0 0 20px rgba(139,92,246,0.1)"; }}
                                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.boxShadow = "none"; }}
                            />
                            <motion.button
                                id="send-button"
                                onClick={handleSend}
                                disabled={loading || !input.trim()}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                style={{
                                    padding: "14px 28px", borderRadius: "999px",
                                    background: loading || !input.trim() ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, #5b2da0, #7c3aed, #6366f1)",
                                    border: "1px solid rgba(255,255,255,0.15)",
                                    color: "white", fontWeight: 600, fontSize: "0.9rem",
                                    cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                                    opacity: loading || !input.trim() ? 0.4 : 1, transition: "all 0.3s",
                                    boxShadow: loading || !input.trim() ? "none" : "0 4px 20px rgba(124,58,237,0.3)",
                                    display: "flex", alignItems: "center", gap: "8px",
                                }}
                            >
                                <span>Send</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                                </svg>
                            </motion.button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
