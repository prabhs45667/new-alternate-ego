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
    saveTrivia,
    saveGameScore,
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

// ═══════════════════════════════════════════════════════════════
//  ENGAGEMENT ZONE — Fun facts + Mini-games during scraping wait
// ═══════════════════════════════════════════════════════════════

const FUN_FACTS = [
    "🧠 Your brain has 86 billion neurons but still can't remember where you kept your keys. AI relates.",
    "🤖 AI was born in 1956. That makes it a Boomer. Let that sink in.",
    "📱 Your digital twin processes data 1000x faster than you — but it still can't fix your sleep schedule.",
    "💀 ChatGPT reached 100M users in 2 months. Your ex couldn't even commit for 2 weeks.",
    "🗣️ We can clone your voice from 3 seconds of audio. Please don't use it to call in sick.",
    "😭 AI can detect 7 emotions from your face. Your crush can't even detect your hints.",
    "🍕 Self-driving cars generate 4TB of data daily. That's like 800,000 pizza order receipts.",
    "🔮 AI will add $15.7 trillion to the economy by 2030. You'll still be splitting the bill.",
    "🧬 AlphaFold predicted protein structures with 98% accuracy. You can't even predict your mood.",
    "⚡ Your Alternate Ego uses RAG to think like YOU. We're sorry in advance.",
    "🎨 AI art won a fine arts competition in 2022. Art students are still recovering.",
    "🎮 AlphaGo has more positions than atoms in the universe. Your dating life has zero positions.",
    "💡 The first AI was a checkers bot from 1951. It's been downhill for humans since then.",
    "📊 90% of world's data was created in the last 2 years. 89% of it is memes.",
    "🌍 More internet devices exist than humans. The robots already outnumber us, we just don't know it.",
    "🎵 AI can compose like Beethoven. Beethoven is rolling in his grave... rhythmically.",
    "📸 Facial recognition scans 36M faces/sec. Tinder can't even show you one good match.",
    "💬 GPT stands for 'Generative Pre-trained Transformer'. Not 'Get Paid to Talk', sadly.",
    "🔐 Your data is encrypted locally. Unlike your texts which are screenshot'd within seconds.",
    "🧊 The first neural network was built in 1958. It probably still loads faster than your WiFi.",
    "📱 Siri launched in 2011 and still can't understand your accent. Some things never change.",
    "🔥 It took 355 GPU-years to train GPT-3. Your assignment took 355 last-minute-hours.",
    "🎪 Alan Turing proposed the Turing Test in 1950. Most Twitter bots still fail it.",
    "🧲 Quantum computers could make AI 1000x powerful. Your laptop struggles with 3 Chrome tabs.",
    "🌱 AI helps farmers increase yields by 30%. Can it help you grow your career though?",
    "🎬 AI voiced young Luke Skywalker. Your voice still cracks on phone calls.",
    "💎 Your Alternate Ego mirrors your personality. That's either exciting or terrifying.",
    "🛡️ AI can be tricked by invisible pixel changes. You can be tricked by 'free shipping'.",
    "🌌 AI discovered a planet using NASA data. You discovered a new reel using the explore page.",
    "🎯 Neural networks were inspired by your brain. Your brain was inspired by procrastination.",
    "📈 The attention mechanism was invented by Google in 2017. Your attention span died that same year.",
    "🚗 4TB of data per car per day. That's your Spotify Wrapped but make it existential.",
    "🎓 80% of enterprises invest in AI. 80% of Gen Z invests in vibes.",
    "🌈 AI generates photorealistic images from text. Your imagination generates anxiety from text.",
    "🔄 Transfer learning lets AI reuse knowledge. You can't even reuse your own lecture notes.",
    "🧪 DeepMind found 2.2M new crystal structures. You found 2.2M reasons to not study.",
    "📡 5G enables real-time AI at the edge. Your edge is crying at 3 AM watching reels.",
    "🎲 Monte Carlo helps AI master strategy games. You master the strategy of avoiding responsibilities.",
    "🤝 Digital twins are used by NASA for spacecraft. You just got one for your personality. You're welcome.",
    "⏰ Your Alternate Ego is being built RIGHT NOW. It's already more productive than you today.",
];

// ── Animated continuous counter component ──
function CountUp({ target }: { target: number }) {
    const [count, setCount] = useState(0);
    useEffect(() => {
        let current = 0;
        const startTime = Date.now();
        const maxDuration = 180_000; // 3 minutes
        let rampUpIv: any;
        let organicIv: any;

        rampUpIv = setInterval(() => {
            current += (target * 0.8) / 20; // Reaches 80% quickly
            if (current >= target * 0.8) {
                current = target * 0.8;
                setCount(Math.floor(current));
                clearInterval(rampUpIv);

                // Start organic fluctuations
                organicIv = setInterval(() => {
                    if (Date.now() - startTime > maxDuration) {
                        clearInterval(organicIv);
                        return; // Pause after 3 mins
                    }
                    // Random fluctuation: usually goes up slightly, sometimes goes down
                    const change = (Math.random() * target * 0.05) * (Math.random() > 0.25 ? 1 : -0.5);
                    current = Math.max(0, current + change);
                    setCount(Math.floor(current));
                }, 800 + Math.random() * 400); // Trigger every 0.8 to 1.2 seconds
            } else {
                setCount(Math.floor(current));
            }
        }, 50);

        return () => {
            clearInterval(rampUpIv);
            if (organicIv) clearInterval(organicIv);
        };
    }, [target]);
    return <>{count.toLocaleString()}</>;
}

type GameTab = "pong" | "bubble";

// ── Worldwide Leaderboards (simulated competitive scores) ──
const LEADERBOARD_PONG = [
    { rank: 1, name: "Arjun_Pro", score: 67, flag: "🇮🇳" },
    { rank: 2, name: "SakuraPlay", score: 58, flag: "🇯🇵" },
    { rank: 3, name: "Mike_NYC", score: 52, flag: "🇺🇸" },
    { rank: 4, name: "Priya.M", score: 48, flag: "🇮🇳" },
    { rank: 5, name: "LucasGG", score: 44, flag: "🇧🇷" },
    { rank: 6, name: "ZaraUK", score: 41, flag: "🇬🇧" },
    { rank: 7, name: "RahulK", score: 38, flag: "🇮🇳" },
    { rank: 8, name: "EmilyW", score: 35, flag: "🇦🇺" },
];
const LEADERBOARD_BUBBLE = [
    { rank: 1, name: "BubbleKing", score: 1240, flag: "🇰🇷" },
    { rank: 2, name: "PopQueen", score: 980, flag: "🇮🇳" },
    { rank: 3, name: "ShooterX", score: 870, flag: "🇺🇸" },
    { rank: 4, name: "NeonBlast", score: 760, flag: "🇯🇵" },
    { rank: 5, name: "AiPong99", score: 650, flag: "🇮🇳" },
    { rank: 6, name: "DarkHorse", score: 590, flag: "🇬🇧" },
    { rank: 7, name: "PixelKing", score: 520, flag: "🇩🇪" },
    { rank: 8, name: "StarPop", score: 480, flag: "🇮🇳" },
];
const BUBBLE_COLORS_GAME = ["#ec4899", "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b"];

function FlipCardZone({ logs }: { logs: string[] }) {
    const [isFlipped, setIsFlipped] = useState(false);
    const [factIndex, setFactIndex] = useState(0);
    const [activeGame, setActiveGame] = useState<GameTab>("pong");
    const [showLeaderboard, setShowLeaderboard] = useState(false);

    // ── Emoji Pong state ──
    const pongCanvasRef = useRef<HTMLCanvasElement>(null);
    const pongAnimRef = useRef<number>(0);
    const pongState = useRef({ x:130, y:80, vx:2.5, vy:2.5, px:105, pw:60, score:0, hi:0, over:false, speed:2.5, emoji:"🍩" });
    const [pongScore, setPongScore] = useState(0);
    const [pongHi, setPongHi] = useState(0);

    // ── Bubble Shooter state ──
    const bubbleCanvasRef = useRef<HTMLCanvasElement>(null);
    const bubbleAnimRef = useRef<number>(0);
    const [bubbleScore, setBubbleScore] = useState(0);
    const [bubbleHi, setBubbleHi] = useState(0);
    const bubbleState = useRef<{
        grid: (number|null)[][]; shootColor: number; nextColor: number;
        aimAngle: number; shooting: boolean; shotX: number; shotY: number;
        shotVX: number; shotVY: number; score: number; hi: number; over: boolean; shots: number;
    }>({ grid:[], shootColor:0, nextColor:1, aimAngle:-Math.PI/2, shooting:false, shotX:0, shotY:0, shotVX:0, shotVY:0, score:0, hi:0, over:false, shots:0 });

    // Rotate facts
    useEffect(() => {
        const iv = setInterval(() => setFactIndex(p => (p + 1) % FUN_FACTS.length), 8000);
        return () => clearInterval(iv);
    }, []);

    // Load hi scores
    useEffect(() => {
        setPongHi(parseInt(localStorage.getItem("ego_pong_hi") || "0"));
        setBubbleHi(parseInt(localStorage.getItem("ego_bubble_hi") || "0"));
        pongState.current.hi = parseInt(localStorage.getItem("ego_pong_hi") || "0");
        bubbleState.current.hi = parseInt(localStorage.getItem("ego_bubble_hi") || "0");
    }, []);

    // ═══════════════════════════════════════════════════
    //  EMOJI PONG — Canvas game loop
    // ═══════════════════════════════════════════════════
    useEffect(() => {
        if (activeGame !== "pong" || !isFlipped) { cancelAnimationFrame(pongAnimRef.current); return; }
        const canvas = pongCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d")!;
        const W = 260, H = 300;
        const s = pongState.current;

        const handleMove = (e: MouseEvent | TouchEvent) => {
            const rect = canvas.getBoundingClientRect();
            const cx = "touches" in e ? e.touches[0].clientX : e.clientX;
            s.px = Math.max(s.pw/2, Math.min(W - s.pw/2, (cx - rect.left) * (W / rect.width)));
        };
        const handleClick = () => {
            if (s.over) {
                s.x=W/2; s.y=80; s.speed=2.5;
                s.vx=2.5*(Math.random()>0.5?1:-1); s.vy=2.5;
                s.score=0; s.over=false;
                s.emoji=["🍩","🏀","⚽","🎾","🌟","🎱"][Math.floor(Math.random()*6)];
                setPongScore(0);
            }
        };
        canvas.addEventListener("mousemove", handleMove);
        canvas.addEventListener("touchmove", handleMove, {passive:true});
        canvas.addEventListener("click", handleClick);

        const loop = () => {
            ctx.fillStyle="#0d0f1a"; ctx.fillRect(0,0,W,H);
            if (!s.over) {
                s.x+=s.vx; s.y+=s.vy;
                if (s.x<=14||s.x>=W-14) s.vx*=-1;
                if (s.y<=14) s.vy=Math.abs(s.vy);
                const pY=H-28;
                if (s.y>=pY-14&&s.y<=pY&&s.x>=s.px-s.pw/2&&s.x<=s.px+s.pw/2) {
                    s.vy=-Math.abs(s.vy);
                    s.vx=((s.x-s.px)/(s.pw/2))*s.speed*1.5;
                    s.score++; setPongScore(s.score);
                    if (s.score%5===0) { s.speed+=0.4; const sign=s.vy>0?1:-1; s.vy=sign*s.speed; }
                }
                if (s.y>H+10) {
                    s.over=true;
                    if (s.score>s.hi) { s.hi=s.score; setPongHi(s.score); localStorage.setItem("ego_pong_hi",String(s.score)); }
                }
            }
            // Score watermark
            ctx.fillStyle="rgba(255,255,255,0.06)"; ctx.font="bold 72px sans-serif"; ctx.textAlign="center"; ctx.fillText(String(s.score),W/2,H/2+20);
            // Hi score
            ctx.fillStyle="rgba(255,255,255,0.35)"; ctx.font="bold 11px sans-serif"; ctx.textAlign="right"; ctx.fillText(`HI ${s.hi}`,W-8,16);
            // Ball
            ctx.font="26px serif"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(s.emoji,s.x,s.y);
            // Paddle
            ctx.fillStyle="#fff"; ctx.beginPath(); ctx.roundRect(s.px-s.pw/2,H-28,s.pw,10,5); ctx.fill();
            // Speed indicator
            ctx.fillStyle="rgba(139,92,246,0.4)"; ctx.font="9px sans-serif"; ctx.textAlign="left"; ctx.fillText(`⚡ ${s.speed.toFixed(1)}x`,6,16);
            if (s.over) {
                ctx.fillStyle="rgba(0,0,0,0.6)"; ctx.fillRect(0,0,W,H);
                ctx.fillStyle="#fff"; ctx.font="bold 20px sans-serif"; ctx.textAlign="center"; ctx.fillText("Game Over!",W/2,H/2-20);
                ctx.font="14px sans-serif"; ctx.fillStyle="#c4b5fd"; ctx.fillText(`Score: ${s.score}`,W/2,H/2+8);
                ctx.font="12px sans-serif"; ctx.fillStyle="rgba(255,255,255,0.5)"; ctx.fillText("Tap to play again",W/2,H/2+32);
            }
            pongAnimRef.current=requestAnimationFrame(loop);
        };
        pongAnimRef.current=requestAnimationFrame(loop);
        return () => { cancelAnimationFrame(pongAnimRef.current); canvas.removeEventListener("mousemove",handleMove); canvas.removeEventListener("touchmove",handleMove); canvas.removeEventListener("click",handleClick); };
    }, [activeGame, isFlipped]);

    // ═══════════════════════════════════════════════════
    //  BUBBLE SHOOTER — Canvas game loop
    // ═══════════════════════════════════════════════════
    const BCOLS=8, BROWS=10, BR=13;
    const initBubbleGrid = () => {
        const grid: (number|null)[][] = [];
        for (let r=0; r<BROWS; r++) {
            grid[r] = [];
            for (let c=0; c<BCOLS; c++) grid[r][c] = r < 4 ? Math.floor(Math.random()*5) : null;
        }
        return grid;
    };
    const resetBubble = () => {
        const bs = bubbleState.current;
        bs.grid = initBubbleGrid(); bs.shootColor=Math.floor(Math.random()*5);
        bs.nextColor=Math.floor(Math.random()*5); bs.shooting=false; bs.score=0; bs.over=false; bs.shots=0;
        bs.aimAngle=-Math.PI/2;
        setBubbleScore(0);
    };
    useEffect(() => { resetBubble(); }, []);

    useEffect(() => {
        if (activeGame !== "bubble" || !isFlipped) { cancelAnimationFrame(bubbleAnimRef.current); return; }
        const canvas = bubbleCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d")!;
        const W=260, H=300;
        const bs = bubbleState.current;
        const ox=(W-BCOLS*BR*2)/2, oy=10;

        const gridToXY = (r:number,c:number) => ({ x: ox + c*BR*2 + BR, y: oy + r*BR*2 + BR });

        // BFS to find connected same-color
        const findCluster = (r:number,c:number,color:number) => {
            const visited=new Set<string>(); const cluster:number[][]=[];
            const q=[[r,c]];
            while(q.length) {
                const [cr,cc]=q.shift()!; const k=`${cr},${cc}`;
                if(visited.has(k)) continue; visited.add(k);
                if(cr<0||cr>=BROWS||cc<0||cc>=BCOLS) continue;
                if(bs.grid[cr][cc]!==color) continue;
                cluster.push([cr,cc]);
                q.push([cr-1,cc],[cr+1,cc],[cr,cc-1],[cr,cc+1]);
            }
            return cluster;
        };

        // Find floating bubbles not connected to top
        const removeFloating = () => {
            const connected=new Set<string>();
            const q:number[][]=[];
            for(let c=0;c<BCOLS;c++) if(bs.grid[0][c]!==null) { q.push([0,c]); connected.add(`0,${c}`); }
            while(q.length) {
                const [r,c]=q.shift()!;
                for(const [nr,nc] of [[r-1,c],[r+1,c],[r,c-1],[r,c+1]]) {
                    const k=`${nr},${nc}`;
                    if(nr>=0&&nr<BROWS&&nc>=0&&nc<BCOLS&&!connected.has(k)&&bs.grid[nr][nc]!==null) {
                        connected.add(k); q.push([nr,nc]);
                    }
                }
            }
            let removed=0;
            for(let r=0;r<BROWS;r++) for(let c=0;c<BCOLS;c++) {
                if(bs.grid[r][c]!==null&&!connected.has(`${r},${c}`)) { bs.grid[r][c]=null; removed++; }
            }
            return removed;
        };

        const handleMouseMove = (e:MouseEvent) => {
            if(bs.shooting||bs.over) return;
            const rect=canvas.getBoundingClientRect();
            const mx=(e.clientX-rect.left)*(W/rect.width);
            const my=(e.clientY-rect.top)*(H/rect.height);
            const sx=W/2, sy=H-20;
            bs.aimAngle=Math.atan2(my-sy,mx-sx);
            if(bs.aimAngle>-0.15) bs.aimAngle=-0.15;
            if(bs.aimAngle<-Math.PI+0.15) bs.aimAngle=-Math.PI+0.15;
        };
        const handleClick = (e:MouseEvent) => {
            if(bs.over) { resetBubble(); return; }
            if(bs.shooting) return;
            bs.shooting=true;
            bs.shotX=W/2; bs.shotY=H-20;
            const speed=6;
            bs.shotVX=Math.cos(bs.aimAngle)*speed;
            bs.shotVY=Math.sin(bs.aimAngle)*speed;
        };
        canvas.addEventListener("mousemove",handleMouseMove);
        canvas.addEventListener("click",handleClick);

        const loop = () => {
            ctx.fillStyle="#0a0c15"; ctx.fillRect(0,0,W,H);
            // Draw grid bubbles
            for(let r=0;r<BROWS;r++) for(let c=0;c<BCOLS;c++) {
                if(bs.grid[r][c]===null) continue;
                const {x,y}=gridToXY(r,c);
                ctx.beginPath(); ctx.arc(x,y,BR-1,0,Math.PI*2);
                ctx.fillStyle=BUBBLE_COLORS_GAME[bs.grid[r][c]!]; ctx.fill();
                ctx.strokeStyle="rgba(255,255,255,0.15)"; ctx.lineWidth=1; ctx.stroke();
            }
            // Shooting bubble in flight
            if(bs.shooting) {
                bs.shotX+=bs.shotVX; bs.shotY+=bs.shotVY;
                if(bs.shotX<=BR) { bs.shotX=BR; bs.shotVX*=-1; }
                if(bs.shotX>=W-BR) { bs.shotX=W-BR; bs.shotVX*=-1; }
                // Check collision with grid or top
                let landed=false; let snapR=0,snapC=0;
                if(bs.shotY<=oy+BR) { // hit top
                    snapR=0; snapC=Math.round((bs.shotX-ox-BR)/(BR*2));
                    snapC=Math.max(0,Math.min(BCOLS-1,snapC)); landed=true;
                } else {
                    for(let r=0;r<BROWS&&!landed;r++) for(let c=0;c<BCOLS&&!landed;c++) {
                        if(bs.grid[r][c]===null) continue;
                        const {x,y}=gridToXY(r,c);
                        const dx=bs.shotX-x, dy=bs.shotY-y;
                        if(Math.sqrt(dx*dx+dy*dy)<BR*2-2) {
                            // Find nearest empty neighbor
                            const neighbors=[[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
                            let bestD=Infinity;
                            for(const [nr,nc] of neighbors) {
                                if(nr>=0&&nr<BROWS&&nc>=0&&nc<BCOLS&&bs.grid[nr][nc]===null) {
                                    const np=gridToXY(nr,nc);
                                    const d=Math.sqrt((bs.shotX-np.x)**2+(bs.shotY-np.y)**2);
                                    if(d<bestD) { bestD=d; snapR=nr; snapC=nc; }
                                }
                            }
                            if(bestD<Infinity) landed=true;
                        }
                    }
                }
                if(landed) {
                    bs.shooting=false;
                    if(snapR>=0&&snapR<BROWS&&snapC>=0&&snapC<BCOLS) {
                        bs.grid[snapR][snapC]=bs.shootColor;
                        const cluster=findCluster(snapR,snapC,bs.shootColor);
                        if(cluster.length>=3) {
                            let pts=cluster.length*10;
                            for(const [cr,cc] of cluster) bs.grid[cr][cc]=null;
                            const floatRemoved=removeFloating();
                            pts+=floatRemoved*15;
                            bs.score+=pts; setBubbleScore(bs.score);
                        }
                    }
                    bs.shootColor=bs.nextColor;
                    bs.nextColor=Math.floor(Math.random()*5);
                    bs.shots++;
                    // Add new row every 8 shots
                    if(bs.shots%8===0) {
                        for(let r=BROWS-1;r>0;r--) bs.grid[r]=[...bs.grid[r-1]];
                        bs.grid[0]=Array.from({length:BCOLS},()=>Math.floor(Math.random()*5));
                    }
                    // Game over check
                    for(let c=0;c<BCOLS;c++) if(bs.grid[BROWS-1][c]!==null) { bs.over=true; break; }
                    if(bs.over&&bs.score>bs.hi) { bs.hi=bs.score; setBubbleHi(bs.score); localStorage.setItem("ego_bubble_hi",String(bs.score)); }
                } else {
                    // Draw flying bubble
                    ctx.beginPath(); ctx.arc(bs.shotX,bs.shotY,BR-1,0,Math.PI*2);
                    ctx.fillStyle=BUBBLE_COLORS_GAME[bs.shootColor]; ctx.fill();
                }
            }
            // Aim line
            if(!bs.shooting&&!bs.over) {
                ctx.save(); ctx.setLineDash([4,4]); ctx.strokeStyle="rgba(255,255,255,0.25)"; ctx.lineWidth=1;
                ctx.beginPath(); ctx.moveTo(W/2,H-20);
                ctx.lineTo(W/2+Math.cos(bs.aimAngle)*80,H-20+Math.sin(bs.aimAngle)*80);
                ctx.stroke(); ctx.restore();
            }
            // Shooter bubble
            ctx.beginPath(); ctx.arc(W/2,H-20,BR-1,0,Math.PI*2);
            ctx.fillStyle=BUBBLE_COLORS_GAME[bs.shootColor]; ctx.fill();
            ctx.strokeStyle="rgba(255,255,255,0.3)"; ctx.lineWidth=2; ctx.stroke();
            // Next bubble preview
            ctx.beginPath(); ctx.arc(W/2+30,H-12,7,0,Math.PI*2);
            ctx.fillStyle=BUBBLE_COLORS_GAME[bs.nextColor]; ctx.fill();
            ctx.fillStyle="rgba(255,255,255,0.3)"; ctx.font="8px sans-serif"; ctx.textAlign="center"; ctx.fillText("NEXT",W/2+30,H-1);
            // Score + Hi
            ctx.fillStyle="rgba(255,255,255,0.35)"; ctx.font="bold 11px sans-serif";
            ctx.textAlign="left"; ctx.fillText(`Score: ${bs.score}`,6,16);
            ctx.textAlign="right"; ctx.fillText(`HI ${bs.hi}`,W-6,16);
            // Game over
            if(bs.over) {
                ctx.fillStyle="rgba(0,0,0,0.6)"; ctx.fillRect(0,0,W,H);
                ctx.fillStyle="#fff"; ctx.font="bold 20px sans-serif"; ctx.textAlign="center"; ctx.fillText("Game Over!",W/2,H/2-20);
                ctx.font="14px sans-serif"; ctx.fillStyle="#c4b5fd"; ctx.fillText(`Score: ${bs.score}`,W/2,H/2+8);
                ctx.font="12px sans-serif"; ctx.fillStyle="rgba(255,255,255,0.5)"; ctx.fillText("Tap to play again",W/2,H/2+32);
            }
            bubbleAnimRef.current=requestAnimationFrame(loop);
        };
        bubbleAnimRef.current=requestAnimationFrame(loop);
        return () => { cancelAnimationFrame(bubbleAnimRef.current); canvas.removeEventListener("mousemove",handleMouseMove); canvas.removeEventListener("click",handleClick); };
    }, [activeGame, isFlipped]);

    // ── Leaderboard renderer ──
    const renderLeaderboard = () => {
        const lb = activeGame === "pong" ? LEADERBOARD_PONG : LEADERBOARD_BUBBLE;
        const myScore = activeGame === "pong" ? pongHi : bubbleHi;
        return (
            <div style={{ display:'flex', flexDirection:'column', gap:'4px', maxHeight:'280px', overflowY:'auto' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
                    <span style={{ fontSize:'0.85rem', fontWeight:700, color:'white' }}>🌍 World Leaderboard</span>
                    <button onClick={()=>setShowLeaderboard(false)} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:'0.7rem' }}>✕ Close</button>
                </div>
                {lb.map((entry, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'5px 8px', borderRadius:'10px', background: i<3?'rgba(139,92,246,0.1)':'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)' }}>
                        <span style={{ fontSize:'0.75rem', fontWeight:700, color: i===0?'#fbbf24':i===1?'#94a3b8':i===2?'#d97706':'rgba(255,255,255,0.4)', width:'18px' }}>#{entry.rank}</span>
                        <span style={{ fontSize:'0.8rem' }}>{entry.flag}</span>
                        <span style={{ flex:1, fontSize:'0.78rem', color:'rgba(255,255,255,0.8)', fontWeight:500 }}>{entry.name}</span>
                        <span style={{ fontSize:'0.78rem', color:'#a78bfa', fontWeight:700 }}>{entry.score}</span>
                    </div>
                ))}
                {myScore > 0 && (
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'5px 8px', borderRadius:'10px', background:'rgba(74,222,128,0.1)', border:'1px solid rgba(74,222,128,0.2)', marginTop:'4px' }}>
                        <span style={{ fontSize:'0.75rem', fontWeight:700, color:'#4ade80', width:'18px' }}>You</span>
                        <span style={{ fontSize:'0.8rem' }}>🎮</span>
                        <span style={{ flex:1, fontSize:'0.78rem', color:'#4ade80', fontWeight:500 }}>Your Best</span>
                        <span style={{ fontSize:'0.78rem', color:'#4ade80', fontWeight:700 }}>{myScore}</span>
                    </div>
                )}
            </div>
        );
    };

    // ── Render game content ──
    const renderGame = () => {
        if (showLeaderboard) return renderLeaderboard();
        if (activeGame === "pong") return (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'6px' }}>
                <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                    <span className="score-badge">🏓 {pongScore}</span>
                    <span className="score-badge">👑 {pongHi}</span>
                    <button onClick={()=>setShowLeaderboard(true)} className="score-badge" style={{ cursor:'pointer', background:'rgba(139,92,246,0.15)', borderColor:'rgba(139,92,246,0.3)', color:'#c4b5fd' }}>🌍 Board</button>
                </div>
                <canvas ref={pongCanvasRef} width={260} height={300} style={{ borderRadius:'12px', cursor:'pointer', width:'100%', maxWidth:'260px', background:'#0d0f1a' }} />
                <p style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.3)', marginTop:'-2px' }}>Move mouse to control paddle</p>
            </div>
        );
        return (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'6px' }}>
                <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                    <span className="score-badge">🫧 {bubbleScore}</span>
                    <span className="score-badge">👑 {bubbleHi}</span>
                    <button onClick={()=>setShowLeaderboard(true)} className="score-badge" style={{ cursor:'pointer', background:'rgba(139,92,246,0.15)', borderColor:'rgba(139,92,246,0.3)', color:'#c4b5fd' }}>🌍 Board</button>
                </div>
                <canvas ref={bubbleCanvasRef} width={260} height={300} style={{ borderRadius:'12px', cursor:'crosshair', width:'100%', maxWidth:'260px', background:'#0a0c15' }} />
                <p style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.3)', marginTop:'-2px' }}>Click to aim & shoot bubbles</p>
            </div>
        );
    };

    return (
        <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.5, duration:0.6 }} className="flip-card-wrapper">
            <div className={`flip-card-inner ${isFlipped ? 'flipped' : ''}`}>
                {/* ══ FRONT — Loading Terminal ══ */}
                <div className="flip-card-face flip-card-front">
                    <div style={{ display:'flex', flexDirection:'column', gap:'6px', flex:1, overflowY:'auto', marginBottom:'12px' }}>
                        {logs.map((msg, i) => (
                            <motion.div key={i} initial={{ opacity:0, x:-10 }} animate={{ opacity:1, x:0 }} transition={{ duration:0.3 }} style={{ display:'flex', gap:'8px', alignItems:'flex-start' }}>
                                <span style={{ color:'#8b5cf6', fontFamily:'monospace', fontSize:'0.8rem', marginTop:'2px' }}>&gt;</span>
                                <span style={{ color: msg.includes('✅')?'#4ade80':msg.includes('⚠️')?'#facc15':'rgba(255,255,255,0.85)', fontSize:'0.83rem', fontFamily:'monospace', letterSpacing:'0.02em', lineHeight:1.4, wordBreak:'break-word' }}>{msg}</span>
                            </motion.div>
                        ))}
                    </div>
                    {/* ── Live Stats Metric Cards ── */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px', marginBottom:'12px' }}>
                        {[
                            { icon:'📊', label:'Data Points', color:'#8b5cf6', max:847 },
                            { icon:'🧠', label:'Traits Found', color:'#ec4899', max:24 },
                            { icon:'🔗', label:'Connections', color:'#3b82f6', max:156 },
                        ].map((stat, i) => (
                            <motion.div key={i}
                                initial={{ opacity:0, y:10 }}
                                animate={{ opacity:1, y:0 }}
                                transition={{ delay: 0.3 + i * 0.15 }}
                                style={{
                                    padding:'10px 8px', borderRadius:'14px',
                                    background:'rgba(255,255,255,0.03)',
                                    border:'1px solid rgba(255,255,255,0.06)',
                                    textAlign:'center', position:'relative', overflow:'hidden',
                                }}
                            >
                                <div style={{ position:'absolute', bottom:0, left:0, right:0, height:'3px', background:'rgba(255,255,255,0.03)' }}>
                                    <motion.div
                                        animate={{ width:['0%','100%'] }}
                                        transition={{ duration: 8 + i * 3, ease:'easeOut' }}
                                        style={{ height:'100%', background:stat.color, borderRadius:'99px', opacity:0.5 }}
                                    />
                                </div>
                                <span style={{ fontSize:'1rem' }}>{stat.icon}</span>
                                <motion.div
                                    style={{ fontSize:'1.2rem', fontWeight:800, color:stat.color, fontFamily:'monospace', lineHeight:1.2, marginTop:'2px' }}
                                >
                                    <CountUp target={stat.max} />
                                </motion.div>
                                <div style={{ fontSize:'0.6rem', color:'rgba(255,255,255,0.4)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.08em', marginTop:'2px' }}>{stat.label}</div>
                            </motion.div>
                        ))}
                    </div>
                    <div style={{ width:'100%', height:'5px', background:'rgba(255,255,255,0.06)', borderRadius:'99px', overflow:'hidden', marginBottom:'8px' }}>
                        <motion.div animate={{ x:['-100%','100%'] }} transition={{ repeat:Infinity, duration:1.8, ease:'easeInOut' }} style={{ width:'40%', height:'100%', background:'linear-gradient(90deg, transparent, #8b5cf6, #6366f1, transparent)', borderRadius:'99px' }} />
                    </div>
                    <div className="flip-hint" onClick={() => setIsFlipped(true)}>
                        <span className="flip-hint-icon">🔄</span> Tap to play games & see fun facts
                    </div>
                </div>

                {/* ══ BACK — Games & Facts ══ */}
                <div className="flip-card-face flip-card-back">
                    {/* Did You Know ticker */}
                    <div style={{ padding:'10px 14px', background:'rgba(139,92,246,0.08)', border:'1px solid rgba(139,92,246,0.2)', borderRadius:'12px', display:'flex', alignItems:'center', gap:'10px', marginBottom:'12px', minHeight:'50px' }}>
                        <span style={{ fontSize:'0.68rem', color:'#a78bfa', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', whiteSpace:'nowrap' }}>DID YOU KNOW</span>
                        <motion.span key={factIndex} initial={{ opacity:0, x:15 }} animate={{ opacity:1, x:0 }} style={{ fontSize:'0.78rem', color:'rgba(255,255,255,0.8)', lineHeight:1.4 }}>{FUN_FACTS[factIndex % FUN_FACTS.length]}</motion.span>
                    </div>
                    {/* Game tabs */}
                    <div className="game-tabs">
                        <button className={`game-tab ${activeGame==="pong"?"active":""}`} onClick={()=>setActiveGame("pong")}>🏓 Emoji Pong</button>
                        <button className={`game-tab ${activeGame==="bubble"?"active":""}`} onClick={()=>setActiveGame("bubble")}>🫧 Bubble Shoot</button>
                    </div>
                    {/* Active game */}
                    <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
                        {renderGame()}
                    </div>
                    <div className="flip-hint" onClick={() => setIsFlipped(false)}>
                        <span className="flip-hint-icon">🔄</span> Tap to see loading progress
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════
//  GEN Z TRIVIA QUIZ — Personality-revealing questions
// ═══════════════════════════════════════════════════════════════

type TriviaQ = { id: number; question: string; type: "mcq" | "text"; options?: string[]; placeholder?: string };

const TRIVIA_QUESTIONS: TriviaQ[] = [
    { id: 1, question: "What's your current relationship status fr fr?", type: "mcq", options: ["Committed 💍", "Situationship 🤷", "Single & thriving 💅", "It's complicated 🫠"] },
    { id: 2, question: "Pick your love language:", type: "mcq", options: ["Quality time 🕐", "Acts of service 🛠️", "Words of affirmation 💬", "Physical touch 🤗", "Gifts 🎁"] },
    { id: 3, question: "Would you rather have ₹1 Crore or know what everyone thinks about you?", type: "mcq", options: ["₹1 Crore 💰", "Mind reading 🧠", "Depends on the day 🌀"] },
    { id: 4, question: "Your ideal Sunday vibe?", type: "mcq", options: ["Netflix & chill 📺", "Cafe hopping ☕", "Sleeping till noon 😴", "Gym & grind 💪", "Road trip 🚗"] },
    { id: 5, question: "Define 'love' in 3-4 words:", type: "text", placeholder: "e.g., 'chaos but beautiful'" },
    { id: 6, question: "Pick your red flag:", type: "mcq", options: ["Double texting 📱", "Being too nice 😇", "Overthinking everything 🧠", "Ghosting back 👻", "No red flags, I'm perfect 💁"] },
    { id: 7, question: "If your life was a Bollywood movie, it'd be:", type: "mcq", options: ["ZNMD — adventure seeker 🏔️", "Wake Up Sid — figuring it out 🎬", "Dil Chahta Hai — friendship first 🤝", "Tamasha — misunderstood soul 🎭"] },
    { id: 8, question: "What's your toxic trait?", type: "text", placeholder: "e.g., 'I say I'm fine when I'm not'" },
    { id: 9, question: "Your go-to comfort food?", type: "mcq", options: ["Maggi 🍜", "Momos 🥟", "Pizza 🍕", "Biryani 🍚", "Chai + Parle-G ☕"] },
    { id: 10, question: "Would you date your AI twin?", type: "mcq", options: ["Absolutely not 🚫", "Maybe for fun 😏", "We'd be a power couple 💪", "That's narcissistic... but yes 👀"] },
    { id: 11, question: "Your dream superpower?", type: "mcq", options: ["Teleportation ✨", "Time travel ⏰", "Mind reading 🧠", "Invisibility 👻", "Unlimited money 💸"] },
    { id: 12, question: "Describe your ideal partner in 3-4 words:", type: "text", placeholder: "e.g., 'funny, smart, loyal'" },
    { id: 13, question: "Your Spotify Wrapped top genre:", type: "mcq", options: ["Bollywood 🎵", "Hip-Hop/Rap 🎤", "Lo-fi/Chill 🌙", "Pop 🎶", "Indie 🎸", "Punjabi 🔊"] },
    { id: 14, question: "₹1000 left this month — you spend it on:", type: "mcq", options: ["Food delivery 🍕", "Online shopping 🛍️", "Going out 🎉", "Save it (lol) 💰", "Recharge + WiFi 📱"] },
    { id: 15, question: "What's your 3 AM thought?", type: "text", placeholder: "e.g., 'why do I exist'" },
    { id: 16, question: "Your friend group role:", type: "mcq", options: ["The planner 📋", "The funny one 😂", "The therapist 🧠", "The quiet one 🤫", "The chaotic one 🔥"] },
    { id: 17, question: "Pick a hill you'll die on:", type: "mcq", options: ["Pineapple on pizza is valid 🍍", "Morning people are lying 🌅", "Instagram > Twitter/X always 📱", "College is overrated 🎓", "AI will take our jobs (and that's fine) 🤖"] },
    { id: 18, question: "Your personality in an emoji:", type: "text", placeholder: "e.g., '🌻' or '🔥'" },
    { id: 19, question: "Would you rather: never use social media again OR never eat your fav food again?", type: "mcq", options: ["Bye social media 👋", "Bye food 😭", "I literally can't choose 💀"] },
    { id: 20, question: "Life motto in 3-4 words:", type: "text", placeholder: "e.g., 'vibe and survive'" },
];

function TriviaQuizCard({ onComplete, session }: { onComplete: () => void; session: any }) {
    const [currentQ, setCurrentQ] = useState(0);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [textInput, setTextInput] = useState("");
    const q = TRIVIA_QUESTIONS[currentQ];
    const totalQ = TRIVIA_QUESTIONS.length;
    const progress = (Object.keys(answers).length / totalQ) * 100;

    const selectAnswer = (ans: string) => {
        const newAnswers = { ...answers, [q.id]: ans };
        setAnswers(newAnswers);
        setTimeout(() => {
            if (currentQ < totalQ - 1) { setCurrentQ(currentQ + 1); setTextInput(""); }
            else { saveAndComplete(newAnswers); }
        }, 400);
    };

    const submitText = () => {
        if (!textInput.trim()) return;
        const newAnswers = { ...answers, [q.id]: textInput.trim() };
        setAnswers(newAnswers);
        setTextInput("");
        if (currentQ < totalQ - 1) { setCurrentQ(currentQ + 1); }
        else { saveAndComplete(newAnswers); }
    };

    const saveAndComplete = async (finalAnswers: Record<number, string>) => {
        try {
            const payload = TRIVIA_QUESTIONS.map(tq => ({
                id: tq.id,
                question: tq.question,
                answer: finalAnswers[tq.id] || "",
                type: tq.type,
            }));
            await fetch("http://localhost:8000/api/save-trivia", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ twin_id: session?.twin_id, session_id: session?.session_id, trivia: payload }),
            });
        } catch (e) { console.warn("Trivia save failed:", e); }
        onComplete();
    };

    return (
        <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'rgba(20,22,30,0.5)', backdropFilter:'blur(24px)', border:'1px solid rgba(236,72,153,0.2)', borderRadius:'24px', padding:'1.5rem', boxShadow:'0 20px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)', overflow:'hidden' }}>
            {/* Header */}
            <div style={{ flexShrink:0, marginBottom:'1rem' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' }}>
                    <h3 style={{ fontSize:'1.1rem', fontWeight:600, color:'white' }}>🎯 Know Yourself Quiz</h3>
                    <span className="score-badge">{Object.keys(answers).length}/{totalQ}</span>
                </div>
                <div style={{ width:'100%', height:'4px', background:'rgba(255,255,255,0.08)', borderRadius:'99px', overflow:'hidden' }}>
                    <motion.div animate={{ width:`${progress}%` }} transition={{ duration:0.4 }} style={{ height:'100%', background:'linear-gradient(90deg, #ec4899, #8b5cf6)', borderRadius:'99px' }} />
                </div>
            </div>

            {/* Question */}
            <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', gap:'14px' }}>
                <motion.p key={currentQ} initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} style={{ fontSize:'1rem', fontWeight:600, color:'white', lineHeight:1.4 }}>
                    {q.question}
                </motion.p>

                {q.type === "mcq" ? (
                    <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                        {q.options?.map((opt, i) => (
                            <motion.button
                                key={i}
                                whileHover={{ scale:1.02 }}
                                whileTap={{ scale:0.98 }}
                                onClick={() => selectAnswer(opt)}
                                style={{
                                    padding:'10px 16px', borderRadius:'14px', textAlign:'left',
                                    background: answers[q.id] === opt ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.04)',
                                    border: answers[q.id] === opt ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.08)',
                                    color: answers[q.id] === opt ? '#c4b5fd' : 'rgba(255,255,255,0.8)',
                                    fontSize:'0.85rem', fontWeight:500, cursor:'pointer', transition:'all 0.2s',
                                }}
                            >
                                {opt}
                            </motion.button>
                        ))}
                    </div>
                ) : (
                    <div style={{ display:'flex', gap:'8px' }}>
                        <input
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value.slice(0, 40))}
                            onKeyDown={(e) => e.key === "Enter" && submitText()}
                            placeholder={q.placeholder}
                            maxLength={40}
                            style={{
                                flex:1, padding:'10px 16px', borderRadius:'14px',
                                background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)',
                                color:'white', fontSize:'0.85rem', outline:'none',
                            }}
                        />
                        <button onClick={submitText} style={{ padding:'10px 18px', borderRadius:'14px', background:'linear-gradient(135deg, #8b5cf6, #6366f1)', border:'none', color:'white', fontWeight:600, fontSize:'0.8rem', cursor:'pointer' }}>→</button>
                    </div>
                )}
            </div>

            {/* Nav */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'12px', flexShrink:0 }}>
                <button disabled={currentQ === 0} onClick={() => { setCurrentQ(currentQ - 1); setTextInput(""); }} style={{ padding:'6px 14px', borderRadius:'999px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.5)', fontSize:'0.75rem', cursor: currentQ === 0 ? 'default' : 'pointer', opacity: currentQ === 0 ? 0.3 : 1 }}>← Back</button>
                <span style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.3)' }}>Q{currentQ + 1} of {totalQ}</span>
                {currentQ < totalQ - 1 && <button onClick={() => { setCurrentQ(currentQ + 1); setTextInput(""); }} style={{ padding:'6px 14px', borderRadius:'999px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.5)', fontSize:'0.75rem', cursor:'pointer' }}>Skip →</button>}
            </div>
        </div>
    );
}

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
    const [avatarPhase, setAvatarPhase] = useState<"capture" | "generating">("capture");
    const [triviaCompleted, setTriviaCompleted] = useState(false);

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
    const [avatarCycleIndex, setAvatarCycleIndex] = useState(0); // Cycles through 4 emotion avatars during generating
    
    // Live WebSocket logs
    const [logs, setLogs] = useState<string[]>([
        "🔍 Scanning social profiles for personality data...",
        "📊 Analyzing LinkedIn connections & endorsements...",
        "📸 Fetching Instagram post history & engagement...",
        "🐦 Checking Twitter/X activity & interests...",
        "🧠 Mapping digital footprint across platforms...",
        "📝 Extracting bio, skills & career highlights...",
        "🔗 Cross-referencing public profile data...",
    ]);
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
                setLogs(prev => [...prev, "✅ Live data stream connected — watching for new insights..."]);
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
                setLogs(prev => [...prev, "⚡ Running in fast-scan mode — processing cached data..."]);
            };
        } catch {
            // WebSocket not available — continue without live logs
        }

        // ══════════════════════════════════════════════════════════
        // HARD 4-MINUTE TIMEOUT — auto-advance even if scraping is slow
        // ══════════════════════════════════════════════════════════
        const SCRAPE_TIMEOUT_MS = 240_000; // 4 minutes max
        let advancedToCamera = false;

        const advanceToCamera = () => {
            if (advancedToCamera) return; // Prevent double-advance
            advancedToCamera = true;
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            setStep("camera");
        };

        // Set a timeout that fires regardless of scraping status
        const timeoutId = setTimeout(() => {
            if (!advancedToCamera) {
                setLogs(prev => [...prev, "⏱️ Time limit reached — moving to next step..."]);
                advanceToCamera();
            }
        }, SCRAPE_TIMEOUT_MS);

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

        // Clear the timeout since scraping finished naturally
        clearTimeout(timeoutId);

        // Move to camera step after scraping (2 second delay for log visibility)
        setTimeout(() => {
            advanceToCamera();
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
    const [avatarRevealTimers, setAvatarRevealTimers] = useState<NodeJS.Timeout[]>([]);
    const [revealCountdown, setRevealCountdown] = useState(0);
    const [allAvatarsReady, setAllAvatarsReady] = useState(false);
    const countdownRef = useRef<NodeJS.Timeout | null>(null);

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

            // Generate all avatars (now instant — just copies local files)
            await generateAllAvatars(
                session.twin_id,
                session.name || "",
                session.gender || "male"
            );

            const urls = EMOTIONS.map(e =>
                `http://localhost:8000/static/storage/avatars/${session.twin_id}/${e}_avatar.png?t=${Date.now()}`
            );

            // ── Staggered 45-second reveal ──
            // Reveal each avatar one by one, 45 seconds apart
            setIsGeneratingAvatar(false);
            setIsCapturing(false);
            setAvatarPhase("generating");
            stopCamera();

            // Start countdown timer
            setRevealCountdown(45);
            countdownRef.current = setInterval(() => {
                setRevealCountdown(prev => {
                    if (prev <= 1) return 45; // Reset for next avatar
                    return prev - 1;
                });
            }, 1000);

            const timers: NodeJS.Timeout[] = [];

            // Neutral at 45s
            timers.push(setTimeout(() => {
                setCapturedPhotos([urls[0]]);
                setCurrentEmotion(1);
            }, 45000));

            // Happy/Smile at 90s
            timers.push(setTimeout(() => {
                setCapturedPhotos(prev => [...prev, urls[1]]);
                setCurrentEmotion(2);
            }, 90000));

            // Sad at 135s
            timers.push(setTimeout(() => {
                setCapturedPhotos(prev => [...prev, urls[2]]);
                setCurrentEmotion(3);
            }, 135000));

            // Angry at 180s — show Ready button
            timers.push(setTimeout(() => {
                setCapturedPhotos(prev => [...prev, urls[3]]);
                setCurrentEmotion(4);
                if (countdownRef.current) clearInterval(countdownRef.current);
                setRevealCountdown(0);
                setAllAvatarsReady(true);
            }, 180000));

            setAvatarRevealTimers(timers);
            return; // Don't hit finally block for isCapturing

        } catch (e) {
            setError("Failed to upload photo and generate avatars.");
            setIsCapturing(false);
            setIsGeneratingAvatar(false);
        }
    };

    const retakePhoto = (index: number) => {
        // Clear all reveal timers
        avatarRevealTimers.forEach(t => clearTimeout(t));
        setAvatarRevealTimers([]);
        if (countdownRef.current) clearInterval(countdownRef.current);
        setRevealCountdown(0);
        setAllAvatarsReady(false);
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
            "🔍 Scanning digital footprint...",
            "🧬 Analyzing voice DNA patterns...",
            "🧠 Training neural pathways...",
            "🎨 Morphing emotion avatars...",
            "⚡ Calibrating consciousness...",
            "✨ Your digital DNA is ready!",
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

                {/* Main content — Split Layout */}
                <div style={{ position: 'relative', zIndex: 10, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 2rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', width: '100%', maxWidth: '1200px', alignItems: 'start' }}>

                        {/* ══ LEFT — Brain + Icons + Title ══ */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
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

                            {/* Title Text */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.6, delay: 0.3 }}
                                style={{ textAlign: 'center' }}
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
                        </div>

                        {/* ══ RIGHT — Glassmorphism Flip Card ══ */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <FlipCardZone logs={logs} />
                        </div>

                    </div>
                </div>
            </div>
        );
    }

    // CAMERA STEP
    if (step === "camera") {
        // ── PHASE 1: Camera Capture ──
        if (avatarPhase === "capture") {
            return (
                <div style={{ height: '100vh', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
                    <div className="form-bg" />
                    <div className="form-bg-overlay" />
                    <canvas ref={canvasRef} className="hidden" />

                    <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '700px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
                        <motion.div initial={{ opacity: 0, y: -15 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'center' }}>
                            <h1 style={{ fontSize: '2rem', fontWeight: 600, color: 'white', marginBottom: '0.3rem' }}>Capture Your Photo</h1>
                            <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>One photo to generate all emotion avatars</p>
                        </motion.div>

                        {/* Camera Feed */}
                        <div style={{ position: 'relative', width: '100%', maxWidth: '550px', aspectRatio: '4/3', borderRadius: '24px', overflow: 'hidden', background: '#000', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
                            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '80px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)', pointerEvents: 'none' }} />
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '100px', background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)', pointerEvents: 'none' }} />
                            {/* Live badge */}
                            <div style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 10, display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '999px', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444', animation: 'pulse 2s ease-in-out infinite' }} />
                                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.8)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Live</span>
                            </div>
                            {/* Instruction */}
                            <div style={{ position: 'absolute', bottom: '16px', left: 0, right: 0, zIndex: 10, textAlign: 'center' }}>
                                <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>{["You just got your salary… now smile 😌💸", "That 'I look good today' smile… right now.", "Don't smile… don't smile… okay smile 😄", "Aaj tu thoda zyada hi cute lag raha hai 😌", "Hero wali smile de zara 😎", "Hans mat… hans mat… okay hans de ab 😂", "Soft smile de… overacting nahi 😄"][Math.floor(Math.random() * 7)]}</p>
                            </div>
                        </div>

                        {/* Capture + Convert Button */}
                        <motion.button
                            whileHover={{ scale: 1.03, boxShadow: '0 12px 40px rgba(139,92,246,0.5)' }}
                            whileTap={{ scale: 0.97 }}
                            onClick={capturePhoto}
                            disabled={isCapturing || isGeneratingAvatar}
                            style={{
                                padding: '16px 40px', borderRadius: '999px',
                                background: 'linear-gradient(135deg, #8b5cf6, #6366f1, #3b82f6)',
                                border: 'none', color: 'white', fontSize: '1rem', fontWeight: 700,
                                letterSpacing: '0.05em', cursor: isCapturing ? 'wait' : 'pointer',
                                boxShadow: '0 8px 30px rgba(139,92,246,0.4)',
                                opacity: isCapturing ? 0.7 : 1,
                                display: 'flex', alignItems: 'center', gap: '8px',
                            }}
                        >
                            {isCapturing ? (<><span className="spinner" style={{ width: '18px', height: '18px' }} /> Capturing...</>) : '📸 Ready to Convert to AI Avatar'}
                        </motion.button>

                        {error && <p style={{ color: '#f87171', fontSize: '0.85rem' }}>{error}</p>}
                    </div>
                </div>
            );
        }

        // ── PHASE 2: Avatar Generation + Trivia Quiz ──
        return (
            <>
            {/* Photo Preview Modal */}
            {previewPhoto && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-lg cursor-pointer"
                    onClick={() => setPreviewPhoto(null)}
                >
                    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.3 }}
                        className="relative max-w-lg w-[90vw] max-h-[80vh] rounded-3xl overflow-hidden shadow-2xl border border-white/20"
                        onClick={(e) => e.stopPropagation()}>
                        <img src={previewPhoto} alt="Preview" className="w-full h-full object-cover" />
                        <button onClick={() => setPreviewPhoto(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-red-500/80 transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
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
                    <motion.div initial={{ opacity: 0, y: -15 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'center', paddingTop: '0.5rem', paddingBottom: '1rem', flexShrink: 0 }}>
                        <h1 style={{ fontSize: '1.8rem', fontWeight: 600, color: 'white', marginBottom: '0.3rem' }}>Your AI Avatars are Generating ✨</h1>
                        <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>Answer some fun questions while we create your digital twin</p>
                    </motion.div>

                    {/* Two-column: Left = Avatars, Right = Trivia */}
                    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}
                        style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem', minHeight: 0 }}>

                        {/* Left: Avatar Generation Cards */}
                        <div style={{ display: 'flex', flexDirection: 'column' as const, background: 'rgba(20,22,30,0.5)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px', padding: '1.5rem', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)' }}>
                            <div style={{ marginBottom: '1rem', flexShrink: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'white' }}>🎭 AI Avatars</h3>
                                    <span style={{ fontSize: '0.8rem', color: '#a78bfa', fontWeight: 600 }}>{capturedPhotos.length}/4</span>
                                </div>
                                <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '99px', overflow: 'hidden', marginTop: '8px' }}>
                                    <motion.div animate={{ width: `${(capturedPhotos.length / 4) * 100}%` }} transition={{ duration: 0.5 }} style={{ height: '100%', background: 'linear-gradient(90deg, #8b5cf6, #6366f1)', borderRadius: '99px' }} />
                                </div>
                            </div>

                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, gap: '0.6rem', overflow: 'auto' }}>
                                {EMOTIONS.map((emotion, i) => {
                                    const isCurrent = i === currentEmotion;
                                    const isCaptured = i < capturedPhotos.length;
                                    return (
                                        <div key={emotion} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.7rem 0.8rem', borderRadius: '16px', transition: 'all 0.3s', background: isCurrent ? 'rgba(139,92,246,0.15)' : 'transparent', border: isCurrent ? '1px solid rgba(139,92,246,0.3)' : '1px solid transparent', opacity: isCaptured ? 1 : isCurrent ? 1 : 0.45 }}>
                                            <div style={{ width: '60px', height: '60px', borderRadius: '14px', overflow: 'hidden', background: 'rgba(0,0,0,0.4)', border: isCaptured ? '2px solid rgba(52,199,89,0.6)' : isCurrent ? '2px solid rgba(139,92,246,0.5)' : '2px solid rgba(255,255,255,0.08)', flexShrink: 0, cursor: isCaptured ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => isCaptured && setPreviewPhoto(capturedPhotos[i])}>
                                                {isCaptured ? (
                                                    <motion.img initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', bounce: 0.4 }} src={capturedPhotos[i]} alt={emotion} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : (
                                                    <span style={{ fontSize: '1.6rem', opacity: isCurrent ? 0.8 : 0.3 }}>{EMOTION_ICONS[emotion]}</span>
                                                )}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <h4 style={{ color: 'white', fontWeight: 500, fontSize: '0.95rem', textTransform: 'capitalize' as const }}>{emotion}</h4>
                                                <p style={{ color: isCaptured ? 'rgba(52,199,89,0.85)' : 'rgba(255,255,255,0.45)', fontSize: '0.75rem', marginTop: '2px' }}>
                                                    {isCaptured ? '✓ Generated' : isCurrent ? `⏳ Generating... ${revealCountdown}s` : 'Coming soon...'}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Ready button */}
                            {allAvatarsReady && triviaCompleted && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: '0.8rem', flexShrink: 0 }}>
                                    <button onClick={() => { setStep("voice"); }}
                                        style={{ width: '100%', padding: '14px 0', borderRadius: '16px', border: 'none', background: 'linear-gradient(135deg, #8b5cf6, #6366f1, #3b82f6)', color: 'white', fontSize: '1rem', fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer', boxShadow: '0 8px 30px rgba(139,92,246,0.4)', textTransform: 'uppercase' as const }}
                                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}>
                                        🎤 Ready for Voice Cloning →
                                    </button>
                                </motion.div>
                            )}
                            {allAvatarsReady && !triviaCompleted && (
                                <div style={{ marginTop: '0.8rem', padding: '0.6rem 1rem', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '14px', flexShrink: 0 }}>
                                    <p style={{ fontSize: '0.75rem', color: '#f59e0b', textAlign: 'center' }}>⏳ Complete the quiz to proceed</p>
                                </div>
                            )}
                            {!allAvatarsReady && (
                                <div style={{ marginTop: '0.8rem', padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                                    <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.4, textAlign: 'center' }}>
                                        🎨 Avatars generating... Answer questions while you wait!
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Right: Trivia Quiz */}
                        <TriviaQuizCard session={session} onComplete={() => setTriviaCompleted(true)} />

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

    // GENERATING STEP — Digital DNA Loading Animation with Avatar Cycling
    const GENERATION_STAGES = [
        { icon: "🔍", label: "Scanning digital footprint", sub: "Extracting social DNA patterns" },
        { icon: "🧬", label: "Analyzing voice DNA", sub: "Decoding speech patterns & tone" },
        { icon: "🧠", label: "Training neural pathways", sub: "Building personality matrix" },
        { icon: "🎨", label: "Morphing avatar", sub: "Syncing emotion expressions" },
        { icon: "⚡", label: "Calibrating consciousness", sub: "Final neural alignment" },
        { icon: "✨", label: "Twin is awakening", sub: "Your digital DNA is ready" },
    ];
    const currentStageIdx = Math.min(Math.floor(generatingProgress / (100 / GENERATION_STAGES.length)), GENERATION_STAGES.length - 1);
    const currentStage = GENERATION_STAGES[currentStageIdx];

    // Avatar cycling effect during generating step
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (step !== "generating") return;
        const interval = setInterval(() => {
            setAvatarCycleIndex(prev => (prev + 1) % 4);
        }, 2000); // Cycle every 2 seconds
        return () => clearInterval(interval);
    }, [step]);

    // Get the cycling avatar URL
    const getCyclingAvatarUrl = () => {
        if (!session?.twin_id) return "";
        const emotion = EMOTIONS[avatarCycleIndex];
        return `http://localhost:8000/static/storage/avatars/${session.twin_id}/${emotion}_avatar.png?t=${Date.now()}`;
    };

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
                    {/* Avatar image with cycling through all 4 emotions */}
                    <div style={{
                        width: '200px', height: '200px', borderRadius: '50%',
                        overflow: 'hidden', position: 'relative',
                        border: '3px solid rgba(139,92,246,0.5)',
                        boxShadow: '0 0 40px rgba(139,92,246,0.4), 0 0 80px rgba(99,102,241,0.2)',
                    }}>
                        {capturedPhotos.length > 0 ? (
                            <>
                                {/* Cycle through all 4 emotion avatars */}
                                {EMOTIONS.map((emotion, i) => (
                                    <img
                                        key={emotion}
                                        src={capturedPhotos[i] || capturedPhotos[0]}
                                        alt={`${emotion} avatar`}
                                        style={{
                                            position: 'absolute',
                                            top: 0, left: 0,
                                            width: '100%', height: '100%', objectFit: 'cover',
                                            opacity: avatarCycleIndex === i ? 1 : 0,
                                            transition: 'opacity 0.8s ease-in-out',
                                            filter: generatingProgress > 60 ? 'saturate(1.5) contrast(1.2)' : 'none',
                                        }}
                                    />
                                ))}
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

                    {/* Emotion label badge beneath avatar */}
                    <motion.div
                        key={`emo-label-${avatarCycleIndex}`}
                        initial={{ opacity: 0, y: 5, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.4 }}
                        style={{
                            position: 'absolute', bottom: '-32px', left: '50%', transform: 'translateX(-50%)',
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '5px 14px', borderRadius: '999px',
                            background: 'rgba(12,14,22,0.85)', backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(139,92,246,0.4)',
                            boxShadow: '0 4px 20px rgba(139,92,246,0.3)',
                        }}
                    >
                        <span style={{ fontSize: '1rem' }}>{EMOTION_ICONS[EMOTIONS[avatarCycleIndex]]}</span>
                        <span style={{ fontSize: '0.7rem', color: '#a78bfa', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                            {EMOTIONS[avatarCycleIndex]}
                        </span>
                    </motion.div>

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
                        Synthesizing{' '}
                        <span style={{
                            background: 'linear-gradient(135deg, #8b5cf6, #ec4899, #6366f1)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        }}>Digital DNA</span>
                    </h1>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>
                        Assembling your AI consciousness from voice, text & social data
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
