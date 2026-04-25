"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { getMemoryGraph, getMemoryStats } from "@/lib/api";

interface GraphNode {
    id: string;
    label: string;
    category: string;
    source: string;
    full_text: string;
    size: number;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
}

interface GraphEdge {
    source: string;
    target: string;
    strength: number;
}

const CATEGORY_COLORS: Record<string, string> = {
    hub: "#8b5cf6",
    social_profile: "#ec4899",
    web_search: "#3b82f6",
    data_export: "#10b981",
    voice_interview: "#f59e0b",
    voice_transcript: "#f97316",
    unknown: "#64748b",
};

const CATEGORY_GLOW: Record<string, string> = {
    hub: "rgba(139,92,246,0.5)",
    social_profile: "rgba(236,72,153,0.4)",
    web_search: "rgba(59,130,246,0.4)",
    data_export: "rgba(16,185,129,0.4)",
    voice_interview: "rgba(245,158,11,0.4)",
    voice_transcript: "rgba(249,115,22,0.4)",
    unknown: "rgba(100,116,139,0.3)",
};

export default function MemoryGraphPage() {
    const router = useRouter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [session, setSession] = useState<any>(null);
    const [nodes, setNodes] = useState<GraphNode[]>([]);
    const [edges, setEdges] = useState<GraphEdge[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [stats, setStats] = useState<any>(null);
    const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
    const [loading, setLoading] = useState(true);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animFrameRef = useRef<number>(0);
    const nodesRef = useRef<GraphNode[]>([]);
    const edgesRef = useRef<GraphEdge[]>([]);
    const mouseRef = useRef({ x: 0, y: 0, down: false, dragNode: null as GraphNode | null });
    const offsetRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const sessionData = localStorage.getItem("ego_session");
        if (!sessionData) { router.push("/"); return; }
        const s = JSON.parse(sessionData);
        setSession(s);
        loadGraph(s.twin_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadGraph = async (twinId: string) => {
        setLoading(true);
        try {
            const [graphData, statsData] = await Promise.all([
                getMemoryGraph(twinId),
                getMemoryStats(twinId),
            ]);
            
            // Initialize positions in a circle
            const cx = 400, cy = 300;
            const graphNodes: GraphNode[] = (graphData.nodes || []).map((n: GraphNode, i: number) => {
                const angle = (i / (graphData.nodes?.length || 1)) * Math.PI * 2;
                const radius = n.category === "hub" ? 100 : 150 + Math.random() * 150;
                return {
                    ...n,
                    x: cx + Math.cos(angle) * radius,
                    y: cy + Math.sin(angle) * radius,
                    vx: 0,
                    vy: 0,
                };
            });
            
            setNodes(graphNodes);
            setEdges(graphData.edges || []);
            setStats(statsData);
            nodesRef.current = graphNodes;
            edgesRef.current = graphData.edges || [];
        } catch (e) {
            console.error("Failed to load graph:", e);
        }
        setLoading(false);
    };

    // Force simulation
    const simulate = useCallback(() => {
        const ns = nodesRef.current;
        const es = edgesRef.current;
        if (!ns.length) return;

        // Apply forces
        for (let i = 0; i < ns.length; i++) {
            const n = ns[i];
            // Center gravity
            n.vx! += (400 - n.x!) * 0.001;
            n.vy! += (300 - n.y!) * 0.001;

            // Repulsion
            for (let j = i + 1; j < ns.length; j++) {
                const o = ns[j];
                const dx = n.x! - o.x!;
                const dy = n.y! - o.y!;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = 800 / (dist * dist);
                n.vx! += (dx / dist) * force;
                n.vy! += (dy / dist) * force;
                o.vx! -= (dx / dist) * force;
                o.vy! -= (dy / dist) * force;
            }
        }

        // Edge attraction
        for (const e of es) {
            const source = ns.find(n => n.id === e.source);
            const target = ns.find(n => n.id === e.target);
            if (source && target) {
                const dx = target.x! - source.x!;
                const dy = target.y! - source.y!;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = (dist - 120) * 0.005 * (e.strength || 0.3);
                source.vx! += (dx / dist) * force;
                source.vy! += (dy / dist) * force;
                target.vx! -= (dx / dist) * force;
                target.vy! -= (dy / dist) * force;
            }
        }

        // Apply velocity & damping
        for (const n of ns) {
            if (mouseRef.current.dragNode === n) continue;
            n.vx! *= 0.85;
            n.vy! *= 0.85;
            n.x! += n.vx!;
            n.y! += n.vy!;
            // Bounds
            n.x = Math.max(30, Math.min(770, n.x!));
            n.y = Math.max(30, Math.min(570, n.y!));
        }
    }, []);

    // Render loop
    const render = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const ns = nodesRef.current;
        const es = edgesRef.current;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = 800 * dpr;
        canvas.height = 600 * dpr;
        ctx.scale(dpr, dpr);

        // Clear
        ctx.clearRect(0, 0, 800, 600);

        // Draw edges
        for (const e of es) {
            const source = ns.find(n => n.id === e.source);
            const target = ns.find(n => n.id === e.target);
            if (source && target) {
                ctx.beginPath();
                ctx.moveTo(source.x!, source.y!);
                ctx.lineTo(target.x!, target.y!);
                ctx.strokeStyle = `rgba(139,92,246,${0.08 + (e.strength || 0.1) * 0.2})`;
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        // Draw nodes
        for (const n of ns) {
            const color = CATEGORY_COLORS[n.category] || CATEGORY_COLORS.unknown;
            const glow = CATEGORY_GLOW[n.category] || CATEGORY_GLOW.unknown;
            const r = n.category === "hub" ? (n.size || 15) * 0.6 : (n.size || 5) * 0.8;

            // Glow
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, r + 4, 0, Math.PI * 2);
            ctx.fillStyle = glow;
            ctx.fill();

            // Node circle
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2);
            ctx.fillStyle = selectedNode?.id === n.id ? "#fff" : color;
            ctx.fill();
            ctx.strokeStyle = "rgba(255,255,255,0.2)";
            ctx.lineWidth = 1;
            ctx.stroke();

            // Label for hubs
            if (n.category === "hub") {
                ctx.font = "11px Inter, sans-serif";
                ctx.fillStyle = "rgba(255,255,255,0.85)";
                ctx.textAlign = "center";
                ctx.fillText(n.label, n.x!, n.y! + r + 16);
            }
        }

        simulate();
        animFrameRef.current = requestAnimationFrame(render);
    }, [simulate, selectedNode]);

    useEffect(() => {
        if (!loading && nodes.length > 0) {
            nodesRef.current = nodes;
            edgesRef.current = edges;
            animFrameRef.current = requestAnimationFrame(render);
        }
        return () => cancelAnimationFrame(animFrameRef.current);
    }, [loading, nodes, edges, render]);

    // Canvas mouse handlers
    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const hit = nodesRef.current.find(n => {
            const r = n.category === "hub" ? (n.size || 15) * 0.6 : (n.size || 5) * 0.8;
            return Math.sqrt((n.x! - x) ** 2 + (n.y! - y) ** 2) < r + 6;
        });
        
        if (hit) {
            mouseRef.current.dragNode = hit;
            mouseRef.current.down = true;
            setSelectedNode(hit);
        }
    };

    const handleCanvasMouseMove = (e: React.MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        mouseRef.current.x = x;
        mouseRef.current.y = y;
        
        if (mouseRef.current.dragNode) {
            mouseRef.current.dragNode.x = x;
            mouseRef.current.dragNode.y = y;
            mouseRef.current.dragNode.vx = 0;
            mouseRef.current.dragNode.vy = 0;
        }
    };

    const handleCanvasMouseUp = () => {
        mouseRef.current.dragNode = null;
        mouseRef.current.down = false;
    };

    if (!session) {
        return (
            <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#07080d" }}>
                <div className="spinner" />
            </div>
        );
    }

    return (
        <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#07080d", overflow: "hidden" }}>
            {/* Header */}
            <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 24px",
                background: "rgba(12,14,22,0.8)",
                backdropFilter: "blur(20px)",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                zIndex: 50,
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <motion.span
                        animate={{ scale: [1, 1.15, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        style={{ fontSize: "1.5rem" }}
                    >🧠</motion.span>
                    <div>
                        <h1 style={{
                            fontSize: "1.2rem", fontWeight: 700, color: "white",
                            background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
                            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                        }}>Memory Graph</h1>
                        <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.3)", letterSpacing: "0.15em", textTransform: "uppercase" }}>
                            knowledge visualization
                        </p>
                    </div>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => router.push("/chat")} style={{
                        padding: "8px 16px", borderRadius: "10px",
                        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                        color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: "0.75rem",
                        transition: "all 0.2s",
                    }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(139,92,246,0.2)"; e.currentTarget.style.color = "white"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
                    >💬 Back to Chat</button>
                </div>
            </div>

            {/* Main content */}
            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                {/* Graph Canvas */}
                <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {/* Background grid */}
                    <div style={{
                        position: "absolute", inset: 0,
                        backgroundImage: "linear-gradient(rgba(139,92,246,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.04) 1px, transparent 1px)",
                        backgroundSize: "40px 40px",
                        pointerEvents: "none",
                    }} />

                    {loading ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            style={{ textAlign: "center" }}
                        >
                            <div className="spinner" style={{ margin: "0 auto 1rem" }} />
                            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem" }}>Loading memory graph...</p>
                        </motion.div>
                    ) : nodes.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={{ textAlign: "center", padding: "2rem" }}
                        >
                            <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🧠</div>
                            <h2 style={{
                                fontSize: "1.5rem", fontWeight: 600,
                                background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
                                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                                marginBottom: "0.5rem",
                            }}>No Memories Yet</h2>
                            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.85rem", maxWidth: "400px" }}>
                                Complete the onboarding process and chat with your twin to start building memories.
                            </p>
                        </motion.div>
                    ) : (
                        <motion.canvas
                            ref={canvasRef}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.5 }}
                            width={800}
                            height={600}
                            style={{
                                width: "800px", height: "600px", cursor: "grab",
                                borderRadius: "20px", border: "1px solid rgba(255,255,255,0.06)",
                                background: "rgba(10,12,18,0.5)",
                            }}
                            onMouseDown={handleCanvasMouseDown}
                            onMouseMove={handleCanvasMouseMove}
                            onMouseUp={handleCanvasMouseUp}
                            onMouseLeave={handleCanvasMouseUp}
                        />
                    )}
                </div>

                {/* Right sidebar */}
                <div style={{
                    width: "320px", flexShrink: 0,
                    display: "flex", flexDirection: "column",
                    padding: "1.5rem",
                    background: "rgba(12,14,22,0.5)",
                    borderLeft: "1px solid rgba(255,255,255,0.05)",
                    overflow: "auto",
                }}>
                    {/* Stats */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        style={{ marginBottom: "1.5rem" }}
                    >
                        <h3 style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1rem" }}>
                            Memory Stats
                        </h3>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                            {[
                                { label: "Knowledge Chunks", value: stats?.total_chunks || 0, icon: "📦" },
                                { label: "Total Words", value: stats?.total_words?.toLocaleString() || "0", icon: "📝" },
                                { label: "Categories", value: Object.keys(stats?.categories || {}).length, icon: "🏷️" },
                                { label: "Est. Pages", value: stats?.estimated_pages || 0, icon: "📄" },
                            ].map((s, i) => (
                                <div key={i} style={{
                                    padding: "12px", borderRadius: "14px",
                                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                                    textAlign: "center",
                                }}>
                                    <div style={{ fontSize: "1.2rem", marginBottom: "4px" }}>{s.icon}</div>
                                    <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "white" }}>{s.value}</div>
                                    <div style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.3)", marginTop: "2px" }}>{s.label}</div>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    {/* Category breakdown */}
                    {stats?.categories && Object.keys(stats.categories).length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 }}
                            style={{ marginBottom: "1.5rem" }}
                        >
                            <h3 style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "0.8rem" }}>
                                Sources
                            </h3>
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                {Object.entries(stats.categories).map(([cat, count]) => {
                                    const color = CATEGORY_COLORS[cat] || "#64748b";
                                    const total = stats.total_chunks || 1;
                                    return (
                                        <div key={cat} style={{
                                            display: "flex", alignItems: "center", gap: "10px",
                                            padding: "8px 10px", borderRadius: "10px",
                                            background: "rgba(255,255,255,0.02)",
                                        }}>
                                            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, flexShrink: 0, boxShadow: `0 0 6px ${color}` }} />
                                            <span style={{ flex: 1, fontSize: "0.75rem", color: "rgba(255,255,255,0.5)", textTransform: "capitalize" }}>
                                                {cat.replace(/_/g, " ")}
                                            </span>
                                            <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)" }}>{String(count)}</span>
                                            <div style={{ width: "60px", height: "3px", borderRadius: "99px", background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                                                <div style={{ width: `${((count as number) / total) * 100}%`, height: "100%", background: color, borderRadius: "99px" }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}

                    {/* Selected node detail */}
                    <AnimatePresence>
                        {selectedNode && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                style={{
                                    padding: "1rem", borderRadius: "16px",
                                    background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)",
                                    marginTop: "auto",
                                }}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                                    <h3 style={{ fontSize: "0.8rem", fontWeight: 600, color: "#a78bfa" }}>Selected Node</h3>
                                    <button
                                        onClick={() => setSelectedNode(null)}
                                        style={{
                                            background: "none", border: "none", color: "rgba(255,255,255,0.3)",
                                            cursor: "pointer", fontSize: "1rem",
                                        }}
                                    >✕</button>
                                </div>
                                <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.7)", lineHeight: 1.5, marginBottom: "6px" }}>
                                    {selectedNode.full_text || selectedNode.label}
                                </p>
                                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                    <span style={{
                                        padding: "3px 8px", borderRadius: "999px", fontSize: "0.6rem",
                                        background: CATEGORY_COLORS[selectedNode.category] + "20",
                                        color: CATEGORY_COLORS[selectedNode.category] || "#94a3b8",
                                        border: `1px solid ${CATEGORY_COLORS[selectedNode.category] || "#94a3b8"}30`,
                                    }}>
                                        {selectedNode.category.replace(/_/g, " ")}
                                    </span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Legend */}
                    <div style={{ marginTop: "auto", paddingTop: "1rem" }}>
                        <p style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.2)", textAlign: "center" }}>
                            💡 Drag nodes to explore • Click to inspect • Larger nodes = more data
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
