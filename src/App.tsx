import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";

const LANES = [
  { id: 0, color: "#FFE033", image: "/chara1.webp", name: "イエロー" },
  { id: 1, color: "#4DD9FF", image: "/chara2.webp", name: "シアン" },
  { id: 2, color: "#FF69B4", image: "/chara3.webp", name: "ピンク" },
];

const trampolineVariants = {
  tap: { scaleY: 0.7, scaleX: 1.15, y: 15, transition: { duration: 0.1 } },
  initial: { scaleY: 1, scaleX: 1, y: 0 },
};

type SequenceKey = "easy" | "normal" | "hard";
const SEQUENCES: Record<SequenceKey, number[][]> = {
  easy: [
    [0],[1],[2],[0],[2],[1],
    [1],[0],[2],[1],[0],[2],
  ],
  normal: [
    [0],[1],[2],[0],
    [1],[2],[1,2],[0],
    [1],[2],[0],[2],
    [0,1],[2],[0],[1],
    [2],[0],[1],[0,2],
    [1],[2],[0],[0,1,2],
  ],
  hard: [
    [0,1,2],[0,1],[0,1,2],[1,2],
    [0,1,2],[0],  [0,1,2],[0,2],
    [0,1,2],[1,2],[0,1,2],[1],
    [0,1,2],[0,1],[0,1,2],[0,1,2],
  ],
};

type GamePhase = "title" | "playing" | "result" | "ending" | "howtoplay";

interface StageConfig {
  id: number;
  planet: string;
  emoji: string;
  file: string;
  bpm: number;
  title: string;
  color: string;
  sequence: SequenceKey;
  fallSec: number;
  intervalBeats: number;
  windows: { perfect: number; good: number; ok: number };
  stars: number;
  offset: number; // 秒単位。負=ノーツを早める、正=遅らせる
}

const STAGES: StageConfig[] = [
  { id:1, planet:"地球",   emoji:"🌍", file:"/earth.mp3",      bpm:160, title:"ぴょんぴょん！",        color:"#4DD9FF", sequence:"easy",   fallSec:4.5, intervalBeats:4, windows:{perfect:600,good:900,ok:1200}, stars:1, offset:0    },
  { id:2, planet:"火星",   emoji:"🔴", file:"/mars.mp3",       bpm:160, title:"マーズアドベンチャー！", color:"#FF6B35", sequence:"easy",   fallSec:4.0, intervalBeats:2, windows:{perfect:450,good:750,ok:1050}, stars:2, offset:0    },
  { id:3, planet:"木星",   emoji:"🪐", file:"/jupiter.mp3",    bpm:160, title:"宇宙を翔けるパイオニア", color:"#B57BEE", sequence:"normal", fallSec:3.5, intervalBeats:2, windows:{perfect:300,good:600,ok:900},  stars:3, offset:0    },
  { id:4, planet:"土星",   emoji:"💍", file:"/saturn.mp3",     bpm:160, title:"黄金のステップ・ハイ",   color:"#FFD700", sequence:"normal", fallSec:2.5, intervalBeats:4, windows:{perfect:200,good:400,ok:650},  stars:4, offset:0    },
  { id:5, planet:"天王星", emoji:"🌊", file:"/uranus.mp3",     bpm:95,  title:"Sapphire Orbit",        color:"#00D4FF", sequence:"normal", fallSec:3.5, intervalBeats:2, windows:{perfect:200,good:400,ok:700},  stars:4, offset:0    },
  { id:6, planet:"金星",   emoji:"✨", file:"/vinus.mp3",      bpm:160, title:"ぜんぶ宝物",             color:"#FF69B4", sequence:"hard",   fallSec:3.0, intervalBeats:2, windows:{perfect:200,good:400,ok:650},  stars:5, offset:0    },
  { id:7, planet:"水星",   emoji:"☿", file:"/mercury.mp3",    bpm:160, title:"太陽系ハイパージャンプ", color:"#FF4B6E", sequence:"hard",   fallSec:2.0, intervalBeats:1, windows:{perfect:150,good:250,ok:400},  stars:5, offset:0    },
];

const ENDING_PARTICLES = Array.from({ length: 24 }, (_, i) => ({
  left: `${(i * 4.1 + 3) % 92 + 4}%`,
  top: `${(i * 13 + 7) % 100}%`,
  delay: i * 0.18,
  duration: 2.2 + (i % 3) * 0.7,
  repeatDelay: 0.5 + (i % 4) * 0.6,
  emoji: ["✨", "⭐", "💫", "🌟"][i % 4],
}));

interface Note {
  id: string;
  laneId: number;
  createdAt: number;
}

export default function App() {
  const [gamePhase, setGamePhase] = useState<GamePhase>(() =>
    localStorage.getItem("hasSeenHowToPlay") ? "title" : "howtoplay"
  );
  const [currentStageId, setCurrentStageId] = useState(1);
  const [isJumping, setIsJumping] = useState([false, false, false]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [judgements, setJudgements] = useState<Record<number, { text: string; time: number }>>({});
  const [isPaused, setIsPaused] = useState(false);
  const [pauseTime, setPauseTime] = useState<number | null>(null);
  const [tapPrompt, setTapPrompt] = useState(false);
  const [trampolinePressed, setTrampolinePressed] = useState([false, false, false]);
  const [comboMilestone, setComboMilestone] = useState<{ text: string; key: number } | null>(null);
  const [unlockedStages, setUnlockedStages] = useState<number[]>(() => {
    const saved = localStorage.getItem("unlockedStages");
    return saved ? JSON.parse(saved) : [1];
  });

  const [viewScale, setViewScale] = useState(1);
  const stageRef = useRef(1);
  const comboRef = useRef(0);
  const notesSpawnedRef = useRef(0);
  const nextNoteRef = useRef(0);
  const currentTimeRef = useRef(Date.now());
  const gameStartedAtRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const noteIdRef = useRef(0);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sfxBuffers = useRef<Record<string, AudioBuffer>>({});
  const trampolineRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);

  useEffect(() => {
    const GAME_W = 420;
    const GAME_H = 750;
    const update = () =>
      setViewScale(Math.min(window.innerWidth / GAME_W, window.innerHeight / GAME_H, 1));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = false;
    audio.volume = 0.3;
    audio.addEventListener("ended", () => setGamePhase("result"));
    bgmRef.current = audio;

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const sfxFiles = { perfect: "/perfect.mp3", good: "/good.mp3", ok: "/ok.mp3", miss: "/miss.mp3", jump: "/jump.mp3" };
    Object.entries(sfxFiles).forEach(([name, path]) => {
      fetch(path)
        .then((r) => r.arrayBuffer())
        .then((buf) => ctx.decodeAudioData(buf))
        .then((decoded) => { sfxBuffers.current[name] = decoded; })
        .catch(() => {});
    });

    return () => {
      audio.pause();
      ctx.close();
    };
  }, []);

  useEffect(() => {
    const animate = () => {
      if (!isPaused && gamePhase === "playing") {
        currentTimeRef.current = Date.now();
        const stage = STAGES.find((s) => s.id === stageRef.current)!;
        const noteFallSec = stage.fallSec * 0.75;
        const audio = bgmRef.current;
        const audioTimeSec = (audio && !audio.paused)
          ? audio.currentTime
          : (gameStartedAtRef.current != null ? (Date.now() - gameStartedAtRef.current) / 1000 : -1);
        if (audioTimeSec >= 0) {
          const beatDurationSec = 60 / stage.bpm;
          while (true) {
            const spawnAtSec =
              nextNoteRef.current * beatDurationSec * stage.intervalBeats + stage.offset - noteFallSec;
            if (audioTimeSec >= spawnAtSec) {
              const seq = SEQUENCES[stage.sequence];
              const pattern = seq[nextNoteRef.current % seq.length];
              const now = Date.now();
              setNotes((prev) => [
                ...prev,
                ...pattern.map((laneId) => ({ id: `note-${noteIdRef.current++}`, laneId, createdAt: now })),
              ]);
              notesSpawnedRef.current += pattern.length;
              nextNoteRef.current++;
            } else {
              break;
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPaused, gamePhase]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = isPaused ? (pauseTime || currentTimeRef.current) : currentTimeRef.current;
      const stage = STAGES.find((s) => s.id === stageRef.current)!;
      const deletionMs = stage.fallSec * 1000 + 300;
      const hitMs = stage.fallSec * 0.75 * 1000;
      setNotes((prev) => {
        const filtered = prev.filter((note) => now - note.createdAt < deletionMs);
        setTapPrompt(
          filtered.some((note) => {
            const elapsed = now - note.createdAt;
            return elapsed > hitMs - stage.windows.perfect && elapsed < hitMs + stage.windows.perfect;
          })
        );
        return filtered;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isPaused, pauseTime]);

  const playSfx = (name: string) => {
    const ctx = audioCtxRef.current;
    const buf = sfxBuffers.current[name];
    if (!ctx || !buf) return;
    const play = () => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    };
    if (ctx.state === "suspended") {
      ctx.resume().then(play);
    } else {
      play();
    }
  };

  const startGame = (overrideStageId?: number) => {
    const id = overrideStageId ?? currentStageId;
    const stage = STAGES.find((s) => s.id === id)!;
    stageRef.current = id;
    setCurrentStageId(id);
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    const beatDurationSec = 60 / stage.bpm;
    const noteFallSec = stage.fallSec * 0.75;
    nextNoteRef.current = Math.ceil((noteFallSec - stage.offset) / (beatDurationSec * stage.intervalBeats));
    noteIdRef.current = 0;
    notesSpawnedRef.current = 0;
    comboRef.current = 0;
    setCombo(0);
    setMaxCombo(0);
    setComboMilestone(null);
    setTotalScore(0);
    setNotes([]);
    setJudgements({});
    setIsPaused(false);
    setPauseTime(null);
    currentTimeRef.current = Date.now();
    gameStartedAtRef.current = Date.now();
    setGamePhase("playing");
    if (bgmRef.current) {
      bgmRef.current.pause();
      bgmRef.current.src = stage.file;
      bgmRef.current.play().catch((e) => console.log("BGM error:", e));
    }
  };

  const handleTap = (laneId: number) => {
    if (gamePhase !== "playing" || isPaused) return;

    const stage = STAGES.find((s) => s.id === stageRef.current)!;
    const hitMs = stage.fallSec * 0.75 * 1000;

    playSfx("jump");
    setTrampolinePressed((prev) => { const a = [...prev]; a[laneId] = true; return a; });
    setTimeout(() => {
      setTrampolinePressed((prev) => { const a = [...prev]; a[laneId] = false; return a; });
    }, 150);
    setIsJumping((prev) => { const a = [...prev]; a[laneId] = true; return a; });
    setTimeout(() => {
      setIsJumping((prev) => { const a = [...prev]; a[laneId] = false; return a; });
    }, 500);

    const hitNote = notes.find((note) => note.laneId === laneId);
    if (hitNote) {
      const timeDiff = Math.abs(Date.now() - hitNote.createdAt - hitMs);
      let judgementText = "Miss";
      let points = 0;

      const MILESTONES: Record<number, string> = {
        10: "✨ 10コンボ！",
        20: "🔥 FEVER！！",
        30: "⚡ 30コンボ！！！",
        50: "🚀 50コンボ！！！！",
        100: "💫 100コンボ！！！！！",
      };

      if (timeDiff < stage.windows.perfect) {
        judgementText = "Perfect! 🎵"; points = 200;
        const n = comboRef.current + 1;
        comboRef.current = n;
        setCombo(n);
        setMaxCombo((m) => Math.max(m, n));
        if (MILESTONES[n]) setComboMilestone({ text: MILESTONES[n], key: Date.now() });
      } else if (timeDiff < stage.windows.good) {
        judgementText = "Good! ✨"; points = 100;
        const n = comboRef.current + 1;
        comboRef.current = n;
        setCombo(n);
        setMaxCombo((m) => Math.max(m, n));
        if (MILESTONES[n]) setComboMilestone({ text: MILESTONES[n], key: Date.now() });
      } else if (timeDiff < stage.windows.ok) {
        judgementText = "OK! 👍"; points = 50;
        const n = comboRef.current + 1;
        comboRef.current = n;
        setCombo(n);
        setMaxCombo((m) => Math.max(m, n));
        if (MILESTONES[n]) setComboMilestone({ text: MILESTONES[n], key: Date.now() });
      } else {
        judgementText = "Miss ❌";
        comboRef.current = 0;
        setCombo(0);
      }

      const judgeTime = Date.now();
      setJudgements((prev) => ({ ...prev, [laneId]: { text: judgementText, time: judgeTime } }));
      setNotes((prev) => prev.filter((n) => n.id !== hitNote.id));
      setTotalScore((prev) => prev + points);

      if (judgementText.includes("Perfect")) playSfx("perfect");
      else if (judgementText.includes("Good")) playSfx("good");
      else if (judgementText.includes("OK")) playSfx("ok");
      else if (judgementText.includes("Miss")) playSfx("miss");

      setTimeout(() => setJudgements((prev) => {
        const next = { ...prev };
        if (next[laneId]?.time === judgeTime) delete next[laneId];
        return next;
      }), 1000);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (gamePhase !== "playing" || isPaused) return;
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      for (let laneId = 0; laneId < trampolineRefs.current.length; laneId++) {
        const el = trampolineRefs.current[laneId];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
            touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
          handleTap(laneId);
          break;
        }
      }
    }
  };

  const handlePause = () => {
    if (!isPaused) {
      setPauseTime(Date.now());
      setIsPaused(true);
      if (bgmRef.current) bgmRef.current.pause();
    } else {
      const pausedDuration = Date.now() - (pauseTime || Date.now());
      setNotes((prev) =>
        prev.map((note) => ({ ...note, createdAt: note.createdAt + pausedDuration }))
      );
      setPauseTime(null);
      currentTimeRef.current = Date.now();
      setIsPaused(false);
      if (bgmRef.current) bgmRef.current.play().catch(() => {});
    }
  };

  const currentStage = STAGES.find((s) => s.id === stageRef.current)!;

  const maxPossibleScore = notesSpawnedRef.current * 200;
  const cleared = gamePhase === "result" && maxPossibleScore > 0 && totalScore >= maxPossibleScore * 0.7;

  // ステージ解放（レンダー外で実行）
  useEffect(() => {
    if (!cleared) return;
    const nextStage = STAGES.find((s) => s.id === currentStage.id + 1);
    if (nextStage && !unlockedStages.includes(nextStage.id)) {
      const newUnlocked = [...unlockedStages, nextStage.id];
      setUnlockedStages(newUnlocked);
      localStorage.setItem("unlockedStages", JSON.stringify(newUnlocked));
    }
  }, [cleared]);

  // ─── リザルト画面 ────────────────────────────────
  if (gamePhase === "result") {
    const nextStage = STAGES.find((s) => s.id === currentStage.id + 1);

    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        height: "100dvh", background: "linear-gradient(135deg, #050015 0%, #0d0035 60%, #000d20 100%)",
        gap: "24px", touchAction: "none", overflowY: "auto", padding: "32px 0",
      }}>
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          style={{ fontSize: "64px" }}
        >
          {cleared ? "🎉" : "😢"}
        </motion.div>

        <div style={{ fontSize: "28px", fontWeight: "bold", color: "#E8E0FF" }}>
          {cleared ? "🌟 クリア！" : "もう一回チャレンジ！"}
        </div>

        <div style={{
          padding: "4px 16px", borderRadius: "20px",
          backgroundColor: currentStage.color + "22",
          border: `2px solid ${currentStage.color}`,
          fontSize: "14px", fontWeight: "bold", color: currentStage.color,
        }}>
          {currentStage.emoji} STAGE {currentStage.id} {currentStage.planet}「{currentStage.title}」
        </div>

        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          style={{
            background: "rgba(255,255,255,0.07)", borderRadius: "24px", padding: "28px 48px",
            boxShadow: "0 8px 32px rgba(100,50,255,0.2)",
            border: "1px solid rgba(255,255,255,0.15)",
            display: "flex", flexDirection: "column", gap: "16px",
            minWidth: "260px", textAlign: "center",
          }}
        >
          <div>
            <div style={{ fontSize: "14px", color: "#9988CC", marginBottom: "4px" }}>スコア</div>
            <div style={{ fontSize: "48px", fontWeight: "bold", color: "#E8E0FF" }}>
              {totalScore.toLocaleString()}
            </div>
            <div style={{ fontSize: "12px", color: "#9988CC", marginTop: "4px" }}>
              クリアライン: {Math.floor(maxPossibleScore * 0.7).toLocaleString()} 点
              {cleared
                ? <span style={{ color: "#5FE88A", marginLeft: "8px" }}>✓ クリア</span>
                : <span style={{ color: "#FF6B6B", marginLeft: "8px" }}>✗ 未クリア</span>
              }
            </div>
          </div>
          <div style={{ height: "1px", backgroundColor: "rgba(255,255,255,0.15)" }} />
          <div>
            <div style={{ fontSize: "14px", color: "#9988CC", marginBottom: "4px" }}>さいこうコンボ</div>
            <div style={{ fontSize: "36px", fontWeight: "bold", color: "#B57BEE" }}>
              {maxCombo} <span style={{ fontSize: "18px" }}>コンボ</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}
        >
          {cleared && nextStage && (
            <motion.button
              whileTap={{ scale: 0.94 }}
              onPointerDown={(e) => { e.preventDefault(); startGame(nextStage.id); }}
              style={{
                padding: "14px 28px", fontSize: "18px", fontWeight: "bold",
                backgroundColor: nextStage.color, color: "white",
                border: "none", borderRadius: "50px", cursor: "pointer",
                boxShadow: `0 6px 20px ${nextStage.color}88`,
              }}
            >
              {nextStage.emoji} NEXT STAGE
            </motion.button>
          )}
          {cleared && !nextStage && (
            <motion.button
              whileTap={{ scale: 0.94 }}
              onPointerDown={(e) => { e.preventDefault(); setGamePhase("ending"); }}
              style={{
                padding: "14px 28px", fontSize: "18px", fontWeight: "bold",
                background: "linear-gradient(135deg, #FFD700 0%, #FF69B4 50%, #B57BEE 100%)",
                color: "white", border: "none", borderRadius: "50px", cursor: "pointer",
                boxShadow: "0 6px 24px rgba(255,215,0,0.5)",
              }}
            >
              🎊 エンディングへ！
            </motion.button>
          )}
          <motion.button
            whileTap={{ scale: 0.94 }}
            onPointerDown={(e) => { e.preventDefault(); startGame(); }}
            style={{
              padding: "14px 28px", fontSize: "18px", fontWeight: "bold",
              backgroundColor: currentStage.color, color: "white",
              border: "none", borderRadius: "50px", cursor: "pointer",
              boxShadow: `0 6px 20px ${currentStage.color}88`,
            }}
          >
            🔄 もう一回！
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.94 }}
            onPointerDown={(e) => { e.preventDefault(); setGamePhase("title"); }}
            style={{
              padding: "14px 28px", fontSize: "18px", fontWeight: "bold",
              backgroundColor: "rgba(255,255,255,0.1)", color: "#C0B0FF",
              border: "2px solid rgba(255,255,255,0.2)", borderRadius: "50px", cursor: "pointer",
            }}
          >
            🏠 タイトル
          </motion.button>
        </motion.div>
      </div>
    );
  }

  // ─── 遊び方画面 ────────────────────────────────────────────────────
  if (gamePhase === "howtoplay") {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        minHeight: "100dvh",
        background: "linear-gradient(135deg, #050015 0%, #0d0035 60%, #000d20 100%)",
        touchAction: "pan-y", overflowY: "auto", padding: "32px 20px 40px", gap: "20px",
      }}>
        <img src="/cosmo-napolitan.webp" alt="" style={{ width: "64px", height: "64px", objectFit: "contain" }} />
        <div style={{ fontSize: "22px", fontWeight: "bold", color: "#E8E0FF" }}>あそびかた</div>

        {/* ミニデモ */}
        <div style={{
          display: "flex", gap: "16px",
          background: "rgba(255,255,255,0.05)", borderRadius: "20px",
          padding: "20px 28px", border: "1px solid rgba(255,255,255,0.1)",
        }}>
          {LANES.map((lane) => (
            <div key={lane.id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{
                position: "relative", width: "56px", height: "120px",
                border: `1.5px dashed ${lane.color}44`, borderRadius: "8px", overflow: "hidden",
              }}>
                <motion.div
                  animate={{ y: [0, 88] }}
                  transition={{ duration: 1.3, repeat: Infinity, repeatDelay: 0.7, ease: "linear", delay: lane.id * 0.45 }}
                  style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", fontSize: "20px" }}
                >
                  ⭐
                </motion.div>
                <div style={{
                  position: "absolute", bottom: "4px", left: "6px", right: "6px", height: "18px",
                  borderRadius: "50%", backgroundColor: lane.color,
                  backgroundImage: "radial-gradient(ellipse at 50% 20%, rgba(255,255,255,0.5) 0%, transparent 65%)",
                  boxShadow: `0 4px 0 rgba(0,0,0,0.4), 0 0 10px ${lane.color}55`,
                }} />
              </div>
            </div>
          ))}
        </div>

        {/* 説明カード */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "300px", width: "100%" }}>
          {[
            { icon: "⭐", title: "星が落ちてくる", desc: "タイミングよくタップしよう！" },
            { icon: "👆", title: "3つのキャラをタップ", desc: "それぞれの色の星に合わせてね" },
          ].map((item) => (
            <div key={item.icon} style={{
              display: "flex", alignItems: "center", gap: "12px",
              background: "rgba(255,255,255,0.05)", borderRadius: "14px", padding: "14px 16px",
            }}>
              <span style={{ fontSize: "28px" }}>{item.icon}</span>
              <div style={{ color: "#C0B0FF", fontSize: "14px", lineHeight: "1.6" }}>
                <span style={{ color: "#E8E0FF", fontWeight: "bold" }}>{item.title}</span><br />
                {item.desc}
              </div>
            </div>
          ))}
        </div>

        {/* 判定説明 */}
        <div style={{
          background: "rgba(255,255,255,0.05)", borderRadius: "16px", padding: "16px 20px",
          border: "1px solid rgba(255,255,255,0.1)", maxWidth: "300px", width: "100%",
        }}>
          <div style={{ fontSize: "12px", color: "#9988CC", marginBottom: "10px", textAlign: "center" }}>はんてい（タイミング）</div>
          {[
            { text: "Perfect! 🎵", color: "#FF69EC", desc: "ぴったり！" },
            { text: "Good! ✨",    color: "#FFD700", desc: "まあまあ" },
            { text: "OK! 👍",      color: "#5FE88A", desc: "ちょっとずれ" },
            { text: "Miss ❌",     color: "#9988CC", desc: "のがした…" },
          ].map((j, i, arr) => (
            <div key={j.text} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "6px 0",
              borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
            }}>
              <span style={{ fontSize: "14px", fontWeight: "bold", color: j.color }}>{j.text}</span>
              <span style={{ fontSize: "12px", color: "#7766AA" }}>{j.desc}</span>
            </div>
          ))}
        </div>

        <motion.button
          whileTap={{ scale: 0.94 }}
          onPointerDown={(e) => {
            e.preventDefault();
            localStorage.setItem("hasSeenHowToPlay", "1");
            setGamePhase("title");
          }}
          style={{
            padding: "16px 48px", fontSize: "20px", fontWeight: "bold",
            backgroundColor: "#B57BEE", color: "white",
            border: "none", borderRadius: "50px", cursor: "pointer",
            boxShadow: "0 6px 24px rgba(181,123,238,0.5)", marginTop: "8px",
          }}
        >
          はじめよう！🚀
        </motion.button>
      </div>
    );
  }

  // ─── エンディング画面 ──────────────────────────────────────────────
  if (gamePhase === "ending") {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        minHeight: "100dvh",
        background: "linear-gradient(135deg, #050015 0%, #0d0035 60%, #000d20 100%)",
        touchAction: "pan-y", overflowY: "auto", padding: "48px 20px",
        position: "relative",
      }}>
        {/* 星パーティクル */}
        {ENDING_PARTICLES.map((p, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0, y: 0 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0, 1.2, 1, 0], y: [0, -60] }}
            transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, repeatDelay: p.repeatDelay }}
            style={{
              position: "fixed", left: p.left, top: p.top,
              fontSize: "18px", pointerEvents: "none", zIndex: 0,
            }}
          >
            {p.emoji}
          </motion.div>
        ))}

        {/* クラッカー */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 150, damping: 12, delay: 0.1 }}
          style={{ fontSize: "80px", zIndex: 1 }}
        >
          🎊
        </motion.div>

        {/* タイトル */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          style={{
            fontSize: "30px", fontWeight: "bold", color: "#FFE033", textAlign: "center",
            textShadow: "0 0 20px #FFE033, 0 0 40px #FFD700",
            marginTop: "16px", zIndex: 1,
          }}
        >
          全ステージクリア！
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          style={{ fontSize: "15px", color: "#9988CC", textAlign: "center", marginTop: "10px", lineHeight: "1.8", zIndex: 1 }}
        >
          コスモなぽりたんと一緒に<br />太陽系を旅したね！🚀
        </motion.div>

        {/* 全惑星パレード */}
        <div style={{
          display: "flex", gap: "10px", marginTop: "36px",
          flexWrap: "wrap", justifyContent: "center", zIndex: 1,
          maxWidth: "400px",
        }}>
          {STAGES.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ scale: 0, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 14, delay: 1.1 + i * 0.1 }}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
                padding: "12px 14px", borderRadius: "16px",
                backgroundColor: s.color + "22",
                border: `2px solid ${s.color}88`,
                boxShadow: `0 4px 16px ${s.color}33`,
                minWidth: "60px",
              }}
            >
              <span style={{ fontSize: "26px" }}>{s.emoji}</span>
              <span style={{ fontSize: "10px", color: s.color, fontWeight: "bold" }}>{s.planet}</span>
              <span style={{ fontSize: "9px", color: "#6655AA", letterSpacing: "1px" }}>{"★".repeat(s.stars)}</span>
            </motion.div>
          ))}
        </div>

        {/* メッセージカード */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.0 }}
          style={{
            marginTop: "36px", padding: "20px 32px", borderRadius: "20px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.15)",
            textAlign: "center", color: "#C0B0FF", fontSize: "14px",
            lineHeight: "1.9", zIndex: 1, maxWidth: "320px",
          }}
        >
          地球から水星まで、<br />
          7つの星を制覇したあなたは<br />
          <span style={{ color: "#FFE033", fontWeight: "bold" }}>本物の宇宙パイロット！</span> 🌌
        </motion.div>

        {/* タイトルへ戻るボタン */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.4 }}
          style={{ marginTop: "36px", zIndex: 1 }}
        >
          <motion.button
            whileTap={{ scale: 0.94 }}
            onPointerDown={(e) => { e.preventDefault(); setGamePhase("title"); }}
            style={{
              padding: "16px 44px", fontSize: "18px", fontWeight: "bold",
              backgroundColor: "#B57BEE", color: "white",
              border: "none", borderRadius: "50px", cursor: "pointer",
              boxShadow: "0 6px 24px rgba(181,123,238,0.5)",
            }}
          >
            🏠 タイトルへ戻る
          </motion.button>
        </motion.div>
      </div>
    );
  }

  // ─── タイトル画面（ステージセレクト） ────────────────────────────────
  if (gamePhase === "title") {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        minHeight: "100dvh",
        background: "linear-gradient(135deg, #050015 0%, #0d0035 60%, #000d20 100%)",
        touchAction: "pan-y", overflowY: "auto", padding: "24px 0 40px",
      }}>
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <img src="/cosmo-napolitan.webp" alt="コスモなぽりたん" style={{ width: "96px", height: "96px", objectFit: "contain" }} />
          <div style={{ fontSize: "20px", fontWeight: "bold", color: "#E8E0FF", marginTop: "8px" }}>
            コスモなぽりたんリズムゲーム
          </div>
        </div>

        <div style={{ fontSize: "13px", color: "#8888BB", marginBottom: "12px" }}>
          ── ステージをえらんでね ──
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "min(90vw, 420px)" }}>
          {STAGES.map((s) => {
            const unlocked = unlockedStages.includes(s.id);
            return (
              <motion.button
                key={s.id}
                whileTap={unlocked ? { scale: 0.97 } : {}}
                onClick={() => { if (unlocked) startGame(s.id); }}
                disabled={!unlocked}
                style={{
                  display: "flex", alignItems: "center", gap: "12px",
                  padding: "12px 16px", borderRadius: "18px",
                  border: `3px solid ${unlocked ? s.color + "88" : "rgba(255,255,255,0.05)"}`,
                  backgroundColor: unlocked ? s.color + "18" : "rgba(0,0,0,0.2)",
                  cursor: unlocked ? "pointer" : "not-allowed",
                  opacity: unlocked ? 1 : 0.4,
                  boxShadow: unlocked ? `0 4px 16px ${s.color}33` : "none",
                }}
              >
                <span style={{ fontSize: "28px" }}>{unlocked ? s.emoji : "🔒"}</span>
                <div style={{ textAlign: "left", flex: 1 }}>
                  <div style={{ fontSize: "15px", fontWeight: "bold", color: "#E8E0FF" }}>
                    STAGE {s.id}　{s.planet}
                  </div>
                  <div style={{ fontSize: "12px", color: unlocked ? s.color : "#444", marginTop: "1px" }}>
                    {unlocked ? s.title : "???"}
                  </div>
                  <div style={{ fontSize: "11px", color: "#9988CC", marginTop: "2px" }}>
                    {"★".repeat(s.stars)}{"☆".repeat(5 - s.stars)}
                  </div>
                </div>
                {unlocked && (
                  <span style={{ fontSize: "14px", color: s.color, opacity: 0.8 }}>▶</span>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── ゲーム画面 ──────────────────────────────────
  return (
    <div style={{
      width: "100vw", height: "100dvh",
      background: "linear-gradient(135deg, #050015 0%, #0d0035 60%, #000d20 100%)",
      touchAction: "none", overflow: "hidden", position: "relative",
    }}
    onTouchStart={handleTouchStart}>
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        transform: `translate(-50%, -50%) scale(${viewScale})`,
        transformOrigin: "center center",
        display: "flex", flexDirection: "column", alignItems: "center", gap: "16px",
      }}>
        {/* ヘッダー */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "28px" }}>{currentStage.emoji}</span>
          <div>
            <div style={{ fontSize: "12px", color: "#9988CC" }}>STAGE {currentStage.id} · {currentStage.planet}</div>
            <div style={{ fontSize: "16px", fontWeight: "bold", color: "#E8E0FF" }}>{currentStage.title}</div>
          </div>
          <div style={{
            padding: "3px 10px", borderRadius: "20px",
            backgroundColor: currentStage.color + "22",
            border: `2px solid ${currentStage.color}`,
            fontSize: "12px", fontWeight: "bold", color: currentStage.color,
          }}>
            {"★".repeat(currentStage.stars)}
          </div>
        </div>

        {/* タッププロンプト */}
        {tapPrompt && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              position: "fixed", top: "50%", left: "30%", transform: "translateX(-50%)",
              fontSize: "40px", fontWeight: "bold", color: "#B57BEE",
              opacity: 0.5, zIndex: 100, pointerEvents: "none",
            }}
          >
            🎵タップ!
          </motion.div>
        )}

        {/* スコア */}
        {(() => {
          const comboColor = combo >= 50 ? "#FF69B4" : combo >= 30 ? "#FF9500" : combo >= 20 ? "#FF6B35" : combo >= 10 ? "#FFE033" : "#B57BEE";
          const comboGlow = combo >= 10 ? `0 0 8px ${comboColor}, 0 0 16px ${comboColor}` : "none";
          return (
            <div style={{ display: "flex", gap: "32px", fontSize: "17px", color: "#9988CC" }}>
              <div>
                コンボ:{" "}
                <motion.span
                  key={combo}
                  initial={{ scale: combo > 0 ? 1.4 : 1 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  style={{ display: "inline-block", fontWeight: "bold", color: comboColor, textShadow: comboGlow }}
                >
                  {combo}
                </motion.span>
              </div>
              <div>
                スコア:{" "}
                <span style={{ fontWeight: "bold", color: "#E8E0FF" }}>{totalScore}</span>
              </div>
            </div>
          );
        })()}

        {/* FEVERバナー */}
        {combo >= 20 && (
          <motion.div
            animate={{ scale: [1, 1.06, 1], opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 0.7, repeat: Infinity, ease: "easeInOut" }}
            style={{
              position: "absolute", top: "90px", left: "50%", transform: "translateX(-50%)",
              fontSize: "20px", fontWeight: "bold",
              color: combo >= 50 ? "#FF69B4" : "#FF9500",
              textShadow: `0 0 12px ${combo >= 50 ? "#FF69B4" : "#FF9500"}, 0 0 24px ${combo >= 50 ? "#FF69B4" : "#FF9500"}`,
              pointerEvents: "none", whiteSpace: "nowrap", zIndex: 100,
            }}
          >
            🔥 FEVER!!
          </motion.div>
        )}

        {/* マイルストーンポップアップ */}
        {comboMilestone && (
          <motion.div
            key={comboMilestone.key}
            initial={{ scale: 0.4, opacity: 0, y: 0 }}
            animate={{ scale: [0.4, 1.5, 1.2], opacity: [0, 1, 1, 0], y: [0, -10, -30] }}
            transition={{ duration: 2.2, times: [0, 0.2, 0.6, 1] }}
            onAnimationComplete={() => setComboMilestone(null)}
            style={{
              position: "absolute", top: "38%", left: "50%", transform: "translateX(-50%)",
              fontSize: "32px", fontWeight: "bold", color: "#FFE033",
              textShadow: "0 0 20px #FFE033, 0 0 40px #FFD700",
              pointerEvents: "none", whiteSpace: "nowrap", zIndex: 500,
            }}
          >
            {comboMilestone.text}
          </motion.div>
        )}

        {/* ゲーム領域 */}
        <div style={{
          display: "flex", gap: "120px", justifyContent: "center",
          position: "relative", width: "100%", padding: "0 40px",
        }}>
          {LANES.map((lane) => (
            <div key={lane.id} style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: "20px", position: "relative", height: "600px",
            }}>
              {/* ノーツドロップエリア */}
              <div style={{
                position: "absolute", top: 0, width: "120px", height: "500px",
                border: `2px dashed ${lane.color}4D`, borderRadius: "10px",
              }}>
                <div style={{ position: "absolute", bottom: "55px", width: "100%", height: "30px", backgroundColor: lane.color, opacity: 0.06, borderRadius: "15px" }} />
                <div style={{ position: "absolute", bottom: "65px", width: "100%", height: "20px", backgroundColor: lane.color, opacity: 0.12, borderRadius: "10px" }} />
                <div style={{ position: "absolute", bottom: "75px", width: "100%", height: "10px", backgroundColor: lane.color, opacity: 0.25, borderRadius: "5px" }} />

                <motion.div
                  style={{
                    position: "absolute", bottom: "80px", width: "100%", height: "4px",
                    backgroundColor: lane.color, opacity: 0.9,
                    boxShadow: `0 0 12px ${lane.color}, 0 0 24px ${lane.color}`, borderRadius: "2px",
                  }}
                  animate={{ opacity: [0.9, 1, 0.9], scale: [1, 1.05, 1] }}
                  transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                />

                {notes
                  .filter((note) => note.laneId === lane.id)
                  .map((note) => (
                    <div
                      key={note.id}
                      style={{
                        position: "absolute", top: 0, left: 0, right: 0, margin: "0 auto",
                        width: "90px", height: "45px", borderRadius: "20px",
                        backgroundColor: lane.color,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "20px", color: "white", fontWeight: "bold",
                        animation: `notefall ${currentStage.fallSec}s linear forwards, noteglow ${currentStage.fallSec}s linear forwards`,
                        animationPlayState: isPaused ? "paused" : "running",
                        "--lane-color": lane.color,
                      } as React.CSSProperties}
                    >
                      ⭐
                    </div>
                  ))}
              </div>

              {/* 判定表示 */}
              {judgements[lane.id] && (
                <motion.div
                  key={judgements[lane.id].time}
                  initial={{ opacity: 1, y: 0 }}
                  animate={{ opacity: 0, y: -50 }}
                  transition={{ duration: 1 }}
                  style={{
                    position: "absolute", bottom: "150px", fontSize: "24px", fontWeight: "bold",
                    color: judgements[lane.id].text.includes("Perfect") ? "#FF69EC"
                         : judgements[lane.id].text.includes("Good") ? "#FFD700"
                         : judgements[lane.id].text.includes("OK") ? "#5FE88A" : "#9988CC",
                    pointerEvents: "none", zIndex: 20,
                  }}
                >
                  {judgements[lane.id].text}
                </motion.div>
              )}

              {/* キャラクター */}
              <motion.div
                initial={{ y: 0 }}
                animate={{
                  y: isJumping[lane.id] ? -150 : 0,
                  transition: { type: "spring", stiffness: 200, damping: 15, mass: 1 },
                }}
                style={{
                  position: "absolute", bottom: "80px", width: "70px", height: "70px",
                  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5,
                }}
              >
                <img src={lane.image} alt={lane.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              </motion.div>

              {/* トランポリン */}
              <motion.div
                ref={(el) => { trampolineRefs.current[lane.id] = el as HTMLDivElement | null; }}
                variants={trampolineVariants}
                animate={trampolinePressed[lane.id] ? "tap" : "initial"}
                initial="initial"
                onPointerDown={(e) => { if (e.pointerType !== "mouse") return; e.preventDefault(); handleTap(lane.id); }}
                style={{
                  position: "absolute", bottom: 0, width: "140px", height: "60px",
                  borderRadius: "50%",
                  backgroundColor: lane.color,
                  backgroundImage: "radial-gradient(ellipse at 50% 20%, rgba(255,255,255,0.55) 0%, transparent 65%)",
                  boxShadow: `0 10px 0 rgba(0,0,0,0.55), 0 6px 0 ${lane.color}88, 0 18px 28px rgba(0,0,0,0.45), 0 0 22px ${lane.color}44, inset 0 2px 5px rgba(255,255,255,0.35), inset 0 -2px 4px rgba(0,0,0,0.25)`,
                  border: "1.5px solid rgba(255,255,255,0.18)",
                  cursor: "pointer", userSelect: "none",
                }}
              />

            </div>
          ))}
        </div>
      </div>

      {/* ペンライト演出（スケール外） */}
      {comboMilestone && (() => {
        const plColors = ["#FFE033", "#4DD9FF", "#FF69B4", "#B57BEE", "#5FE88A", "#FF9500", "#FF4B6E"];
        const count = combo >= 100 ? 12 : combo >= 50 ? 9 : combo >= 30 ? 6 : combo >= 20 ? 4 : 2;
        const penlights = Array.from({ length: count }, (_, i) => ({
          xOffset: 8 + (i % 3) * 22,
          bottomPct: 5 + (i / Math.max(count - 1, 1)) * 82,
          color: plColors[i % plColors.length],
          delay: i * 0.04,
        }));
        return (
          <>
            {penlights.map((pl, i) => (
              <motion.div
                key={`pl-l-${comboMilestone.key}-${i}`}
                initial={{ x: -(pl.xOffset + 90), opacity: 0 }}
                animate={{ x: [-(pl.xOffset + 90), 0, 0, -(pl.xOffset + 90)], opacity: [0, 1, 1, 0] }}
                transition={{ duration: 2.4, times: [0, 0.15, 0.82, 1], delay: pl.delay }}
                style={{ position: "absolute", left: pl.xOffset, bottom: `${pl.bottomPct}%`, zIndex: 400 }}
              >
                <motion.div
                  animate={{ rotate: [-35 - (i%3)*5, -10 - (i%3)*3, -48 - (i%3)*5, -15 - (i%3)*3, -35 - (i%3)*5] }}
                  transition={{ duration: 2, times: [0, 0.3, 0.55, 0.8, 1], delay: pl.delay }}
                  style={{
                    width: "11px", height: "78px", borderRadius: "5px 5px 3px 3px",
                    background: `linear-gradient(to top, ${pl.color}55, ${pl.color})`,
                    boxShadow: `0 0 8px ${pl.color}, 0 0 22px ${pl.color}88`,
                    transformOrigin: "bottom center",
                  }}
                />
              </motion.div>
            ))}
            {penlights.map((pl, i) => (
              <motion.div
                key={`pl-r-${comboMilestone.key}-${i}`}
                initial={{ x: (pl.xOffset + 90), opacity: 0 }}
                animate={{ x: [(pl.xOffset + 90), 0, 0, (pl.xOffset + 90)], opacity: [0, 1, 1, 0] }}
                transition={{ duration: 2.4, times: [0, 0.15, 0.82, 1], delay: pl.delay }}
                style={{ position: "absolute", right: pl.xOffset, bottom: `${pl.bottomPct}%`, zIndex: 400 }}
              >
                <motion.div
                  animate={{ rotate: [35 + (i%3)*5, 10 + (i%3)*3, 48 + (i%3)*5, 15 + (i%3)*3, 35 + (i%3)*5] }}
                  transition={{ duration: 2, times: [0, 0.3, 0.55, 0.8, 1], delay: pl.delay }}
                  style={{
                    width: "11px", height: "78px", borderRadius: "5px 5px 3px 3px",
                    background: `linear-gradient(to top, ${pl.color}55, ${pl.color})`,
                    boxShadow: `0 0 8px ${pl.color}, 0 0 22px ${pl.color}88`,
                    transformOrigin: "bottom center",
                  }}
                />
              </motion.div>
            ))}
          </>
        );
      })()}

      {/* 右上の一時停止ボタン */}
      <button
        onPointerDown={(e) => { e.preventDefault(); handlePause(); }}
        style={{
          position: "absolute", top: "12px", right: "12px",
          width: "44px", height: "44px", borderRadius: "50%",
          backgroundColor: "rgba(0,0,0,0.15)", color: "white",
          border: "none", fontSize: "20px", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
        }}
      >
        ⏸
      </button>

      {/* 一時停止オーバーレイ */}
      {isPaused && (
        <div style={{
          position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: "20px", zIndex: 300,
        }}>
          <div style={{ fontSize: "28px", fontWeight: "bold", color: "white" }}>⏸ 一時停止中</div>
          <motion.button
            whileTap={{ scale: 0.94 }}
            onPointerDown={(e) => { e.preventDefault(); handlePause(); }}
            style={{
              padding: "14px 40px", fontSize: "20px", fontWeight: "bold",
              backgroundColor: "#4CAF50", color: "white",
              border: "none", borderRadius: "50px", cursor: "pointer",
              boxShadow: "0 4px 16px rgba(76,175,80,0.5)",
            }}
          >
            ▶ 再開
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.94 }}
            onPointerDown={(e) => {
              e.preventDefault();
              if (bgmRef.current) bgmRef.current.pause();
              setNotes([]);
              setIsPaused(false);
              setGamePhase("title");
            }}
            style={{
              padding: "12px 32px", fontSize: "16px", fontWeight: "bold",
              backgroundColor: "rgba(255,255,255,0.2)", color: "white",
              border: "2px solid rgba(255,255,255,0.5)", borderRadius: "50px", cursor: "pointer",
            }}
          >
            🏠 タイトルへ
          </motion.button>
        </div>
      )}
    </div>
  );
}
