import { useState, useEffect, useMemo, useCallback } from "react";

const SPREADSHEET_ID = "1doxLh9w5MgsbBhLiKLYAQzwmIIsnSd-t4MrgSRJr5Zo";
const SHEET_NAME = "Player_Matches";
const API_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}`;

const SEASONS = [
  { key: "east", label: "East Wind", emoji: "🟥", months: [1, 2, 3] },
  { key: "south", label: "South Wind", emoji: "🟩", months: [4, 5, 6] },
  { key: "west", label: "West Wind", emoji: "🟦", months: [7, 8, 9] },
  { key: "north", label: "North Wind", emoji: "🟨", months: [10, 11, 12] },
];

const WIND_KANJI = { east: "東", south: "南", west: "西", north: "北" };
const WIND_COLORS = {
  east: { bg: "#c0392b", text: "#fff", light: "#fdf0ef" },
  south: { bg: "#27ae60", text: "#fff", light: "#eafaf1" },
  west: { bg: "#2980b9", text: "#fff", light: "#eaf4fb" },
  north: { bg: "#d4ac0d", text: "#fff", light: "#fef9e7" },
};

const RANK_LABELS = ["1st", "2nd", "3rd", "4th"];
const RANK_COLORS = ["#c0392b", "#e67e22", "#27ae60", "#2980b9"];
const RANK_BG = ["#fdf0ef", "#fef5ec", "#eafaf1", "#eaf4fb"];

const TROPHY_ICONS = ["🥇", "🥈", "🥉"];

function getCurrentSeason() {
  const month = new Date().getMonth() + 1;
  return SEASONS.find((s) => s.months.includes(month))?.key || "east";
}

function getYears(data) {
  const years = new Set(data.map((r) => new Date(r.start_time).getFullYear()));
  return [...years].sort((a, b) => b - a);
}

function filterBySeason(data, seasonKey, year) {
  const season = SEASONS.find((s) => s.key === seasonKey);
  if (!season) return data;
  return data.filter((r) => {
    const d = new Date(r.start_time);
    return d.getFullYear() === year && season.months.includes(d.getMonth() + 1);
  });
}

function parseGoogleSheets(raw) {
  try {
    const json = JSON.parse(raw.replace(/^[^{]*/, "").replace(/[^}]*$/, ""));
    const cols = json.table.cols.map((c) => ({ label: c.label.trim().toLowerCase(), type: c.type }));
    return json.table.rows
      .filter((r) => r && r.c)
      .map((r) => {
        const obj = {};
        cols.forEach((col, i) => {
          const cell = r.c[i];
          if (!cell || cell.v === null || cell.v === undefined) {
            obj[col.label] = "";
          } else if (col.type === "datetime" || col.type === "date") {
            obj[col.label] = cell.f || cell.v;
          } else {
            obj[col.label] = cell.v;
          }
        });
        return obj;
      })
      .filter((r) => r.game_id);
  } catch {
    return [];
  }
}

function buildLeaderboard(data) {
  const map = {};
  data.forEach((r) => {
    const id = r.player_id || r.player_name;
    if (!map[id]) map[id] = { player_id: id, player_name: r.player_name, total_score: 0, total_pt: 0, games: 0 };
    map[id].total_score += (Number(r.player_score) || 0) - 25000;
    map[id].total_pt += Number(r.player_pt) || 0;
    map[id].games += 1;
  });
  return Object.values(map).sort((a, b) => b.total_pt - a.total_pt || b.total_score - a.total_score);
}

function PieChart({ rankCounts }) {
  const total = rankCounts.reduce((a, b) => a + b, 0);
  if (!total) return <div style={{ textAlign: "center", color: "#888", padding: "2rem 0" }}>No data</div>;

  const size = 160;
  const cx = size / 2, cy = size / 2, r = 60, hole = 36;
  let angle = -Math.PI / 2;
  const slices = rankCounts.map((count, i) => {
    const pct = count / total;
    const start = angle;
    angle += pct * 2 * Math.PI;
    const end = angle;
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    const ix1 = cx + hole * Math.cos(start), iy1 = cy + hole * Math.sin(start);
    const ix2 = cx + hole * Math.cos(end), iy2 = cy + hole * Math.sin(end);
    const large = pct > 0.5 ? 1 : 0;
    const d = pct === 1
      ? `M ${x1} ${y1} A ${r} ${r} 0 1 1 ${x1 - 0.01} ${y1} Z`
      : `M ${ix1} ${iy1} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${hole} ${hole} 0 ${large} 0 ${ix1} ${iy1} Z`;
    return { d, color: RANK_COLORS[i], count, pct };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s, i) => s.count > 0 && (
          <path key={i} d={s.d} fill={s.color} />
        ))}
        <circle cx={cx} cy={cy} r={hole - 2} fill="white" />
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize="13" fontWeight="600" fill="#1a3a1a">{total}</text>
        <text x={cx} y={cy + 18} textAnchor="middle" fontSize="9" fill="#666">games</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {RANK_LABELS.map((label, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: RANK_COLORS[i], flexShrink: 0 }} />
            <span style={{ color: "#555", minWidth: 32 }}>{label}</span>
            <span style={{ fontWeight: 600, color: RANK_COLORS[i] }}>{rankCounts[i]}</span>
            <span style={{ color: "#aaa", fontSize: 12 }}>({total ? Math.round(rankCounts[i] / total * 100) : 0}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{ background: "none", border: "1px solid #c8e6c9", borderRadius: 6, padding: "2px 8px", fontSize: 11, cursor: "pointer", color: copied ? "#27ae60" : "#888", transition: "all .2s" }}
    >
      {copied ? "✓ copied" : "copy"}
    </button>
  );
}

function Chip({ children, color = "#27ae60" }) {
  return (
    <span style={{ background: color + "18", color, border: `1px solid ${color}40`, borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
      {children}
    </span>
  );
}

function WindBadge({ seasonKey }) {
  const c = WIND_COLORS[seasonKey] || WIND_COLORS.east;
  const s = SEASONS.find((x) => x.key === seasonKey);
  return (
    <span style={{ background: c.bg, color: c.text, borderRadius: 8, padding: "3px 12px", fontWeight: 700, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
      {s?.emoji} {s?.label}
    </span>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "4rem 2rem", color: "#7a9e7a" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🀄</div>
      <div style={{ fontFamily: "'Noto Serif', Georgia, serif", fontSize: 18, fontWeight: 600, color: "#3a6b3a" }}>The Wind Has Not Yet Blown.</div>
      <div style={{ fontSize: 13, marginTop: 8, color: "#aaa" }}>No data for this season</div>
    </div>
  );
}

export default function MJGTDashboard() {
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState("home");
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [season, setSeason] = useState(getCurrentSeason());
  const [year, setYear] = useState(new Date().getFullYear());
  const [search, setSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [profileDateFrom, setProfileDateFrom] = useState("");
  const [profileDateTo, setProfileDateTo] = useState("");
  const [profileOpponent, setProfileOpponent] = useState("");

  useEffect(() => {
    fetch(API_URL)
      .then((r) => r.text())
      .then((raw) => { setAllData(parseGoogleSheets(raw)); setLoading(false); })
      .catch(() => { setError("Could not load data from Google Sheets."); setLoading(false); });
  }, []);

  const years = useMemo(() => getYears(allData), [allData]);

  const availableSeasons = useMemo(() => {
    const set = new Set();
    allData.forEach((r) => {
      const d = new Date(r.start_time);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const s = SEASONS.find((s) => s.months.includes(m));
      if (s) set.add(`${s.key}-${y}`);
    });
    return [...set]
      .map((key) => {
        const dash = key.lastIndexOf("-");
        return { seasonKey: key.slice(0, dash), year: Number(key.slice(dash + 1)) };
      })
      .sort((a, b) => a.year - b.year || SEASONS.findIndex((s) => s.key === a.seasonKey) - SEASONS.findIndex((s) => s.key === b.seasonKey));
  }, [allData]);

  useEffect(() => {
    if (availableSeasons.length === 0) return;
    const current = availableSeasons.find((s) => s.seasonKey === season && s.year === year);
    if (!current) {
      const last = availableSeasons[availableSeasons.length - 1];
      setSeason(last.seasonKey);
      setYear(last.year);
    }
  }, [availableSeasons]);

  const seasonData = useMemo(() => filterBySeason(allData, season, year), [allData, season, year]);
  const leaderboard = useMemo(() => buildLeaderboard(seasonData), [seasonData]);

  const allPlayers = useMemo(() => {
    const map = {};
    allData.forEach((r) => { if (r.player_name) map[r.player_id || r.player_name] = r.player_name; });
    return Object.entries(map).map(([id, name]) => ({ id, name }));
  }, [allData]);

  const suggestions = useMemo(() => {
    if (!search.trim()) return [];
    return allPlayers.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8);
  }, [search, allPlayers]);

  const openProfile = useCallback((player) => {
    setSelectedPlayer(player);
    setProfileDateFrom("");
    setProfileDateTo("");
    setProfileOpponent("");
    setPage("profile");
  }, []);

  const playerAllGames = useMemo(() => {
    if (!selectedPlayer) return [];
    const pid = String(selectedPlayer.player_id);
    return allData
      .filter((r) => String(r.player_id || r.player_name) === pid)
      .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  }, [allData, selectedPlayer]);

  const opponents = useMemo(() => {
    if (!selectedPlayer) return [];
    const pid = String(selectedPlayer.player_id);
    const gameIds = new Set(playerAllGames.map((r) => r.game_id));
    const opp = new Set();
    allData.forEach((r) => {
      if (gameIds.has(r.game_id) && String(r.player_id || r.player_name) !== pid) opp.add(r.player_name);
    });
    return [...opp].sort();
  }, [allData, selectedPlayer, playerAllGames]);

  const filteredProfileGames = useMemo(() => {
    let games = playerAllGames;
    if (profileDateFrom) games = games.filter((r) => new Date(r.start_time) >= new Date(profileDateFrom));
    if (profileDateTo) games = games.filter((r) => new Date(r.start_time) <= new Date(profileDateTo + "T23:59:59"));
    if (profileOpponent) {
      const oppGames = new Set(
        allData.filter((r) => r.player_name === profileOpponent).map((r) => r.game_id)
      );
      games = games.filter((r) => oppGames.has(r.game_id));
    }
    return games;
  }, [playerAllGames, profileDateFrom, profileDateTo, profileOpponent, allData]);

  const gameAllPlayers = useMemo(() => {
    const gameIds = new Set(filteredProfileGames.map((r) => r.game_id));
    const map = {};
    allData.forEach((r) => {
      if (gameIds.has(r.game_id)) {
        if (!map[r.game_id]) map[r.game_id] = [];
        map[r.game_id].push(r);
      }
    });
    Object.values(map).forEach((players) =>
      players.sort((a, b) => Number(a.player_rank) - Number(b.player_rank))
    );
    return map;
  }, [allData, filteredProfileGames]);

  const rankCounts = useMemo(() => {
    const counts = [0, 0, 0, 0];
    filteredProfileGames.forEach((r) => {
      const rank = Number(r.player_rank);
      if (rank >= 1 && rank <= 4) counts[rank - 1]++;
    });
    return counts;
  }, [filteredProfileGames]);

  const profileStats = useMemo(() => {
    const total = filteredProfileGames.length;
    const totalScore = filteredProfileGames.reduce((a, r) => a + (Number(r.player_score) || 0) - 25000, 0);
    const totalPt = filteredProfileGames.reduce((a, r) => a + (Number(r.player_pt) || 0), 0);
    const avg = total ? (totalPt / total).toFixed(2) : "—";
    return { total, totalScore, totalPt, avg };
  }, [filteredProfileGames]);

  const seasonRank = useMemo(() => {
    if (!selectedPlayer) return null;
    const idx = leaderboard.findIndex((p) => p.player_id === selectedPlayer.player_id);
    return idx >= 0 ? idx + 1 : null;
  }, [leaderboard, selectedPlayer]);

  if (loading) return (
    <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f0faf0" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🀄</div>
      <div style={{ color: "#27ae60", fontWeight: 600, fontSize: 16 }}>Loading tiles...</div>
    </div>
  );

  if (error) return (
    <div style={{ padding: "3rem", textAlign: "center", color: "#c0392b" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
      <div>{error}</div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Noto Sans', 'Sarabun', sans-serif", background: "#f0faf0", minHeight: "100vh" }}>
      {/* Header */}
      <header style={{ background: "linear-gradient(135deg, #1a5c2a 0%, #145a32 60%, #0e4020 100%)", borderBottom: "3px solid #c0392b", padding: "0 1.5rem" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", alignItems: "center", gap: 16, padding: "14px 0" }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", overflow: "hidden", border: "3px solid #a8d5a8", flexShrink: 0, boxShadow: "0 0 0 4px rgba(168,213,168,0.25), 0 4px 16px rgba(0,0,0,0.35)" }}>
            <img
              src={`${import.meta.env.BASE_URL}cat-logo.jpg`}
              alt="MJGT Cat"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
          <div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 20, letterSpacing: 1, lineHeight: 1.1 }}>MJGT</div>
            <div style={{ color: "#a8d5a8", fontSize: 12, letterSpacing: 0.5 }}>
              Mahjong <s style={{ opacity: 0.5 }}>Together</s> Growth Tracker
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {["home", "leaderboard"].map((p) => (
              <button key={p} onClick={() => setPage(p === "leaderboard" ? "home" : p)}
                style={{ background: page === "home" && p === "home" ? "#27ae60" : "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                {p === "home" ? "🏠 Home" : "🏆 Leaderboard"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "1.5rem" }}>

        {/* HOME PAGE */}
        {page === "home" && (
          <div>
            {/* Season Dropdown */}
            {availableSeasons.length > 0 && (
              <div style={{ marginBottom: "1.5rem" }}>
                <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                  <span style={{ position: "absolute", left: 10, fontSize: 18, pointerEvents: "none", lineHeight: 1 }}>🧭</span>
                  <select
                    value={`${season}-${year}`}
                    onChange={(e) => {
                      const dash = e.target.value.lastIndexOf("-");
                      setSeason(e.target.value.slice(0, dash));
                      setYear(Number(e.target.value.slice(dash + 1)));
                    }}
                    style={{ background: "#fff", border: "1.5px solid #c8e6c9", borderRadius: 10, padding: "8px 16px 8px 36px", fontSize: 14, color: "#1a3a1a", fontWeight: 700, cursor: "pointer", outline: "none" }}
                  >
                    {availableSeasons.map(({ seasonKey, year: y }) => {
                      const s = SEASONS.find((x) => x.key === seasonKey);
                      return (
                        <option key={`${seasonKey}-${y}`} value={`${seasonKey}-${y}`}>
                          {s?.label} {y}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            )}

            {/* Search */}
            <div style={{ position: "relative", marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", background: "#fff", border: "1.5px solid #c8e6c9", borderRadius: 12, padding: "8px 14px", gap: 10 }}>
                <span style={{ color: "#888", fontSize: 16 }}>🔍</span>
                <input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="Search player..."
                  style={{ flex: 1, border: "none", outline: "none", fontSize: 14, background: "transparent", color: "#1a3a1a" }}
                />
                {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: 16 }}>×</button>}
              </div>
              {showSuggestions && suggestions.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1.5px solid #c8e6c9", borderRadius: 10, marginTop: 4, boxShadow: "0 4px 16px rgba(0,80,0,0.1)", zIndex: 100, overflow: "hidden" }}>
                  {suggestions.map((p) => (
                    <button key={p.id} onMouseDown={() => { openProfile({ player_id: p.id, player_name: p.name }); setSearch(""); }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 16px", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#1a3a1a", borderBottom: "0.5px solid #e8f5e9" }}>
                      👤 {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Season heading */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1rem" }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: WIND_COLORS[season].bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#fff", fontWeight: 900, fontFamily: "serif" }}>
                {WIND_KANJI[season]}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18, color: "#1a3a1a" }}>
                  {SEASONS.find((s) => s.key === season)?.label} Season {year}
                </div>
                <div style={{ fontSize: 12, color: "#7a9e7a" }}>
                  {SEASONS.find((s) => s.key === season)?.months.map((m) => new Date(2000, m - 1).toLocaleString("en", { month: "short" })).join(" – ")}
                </div>
              </div>
              <div style={{ marginLeft: "auto", background: "#e8f5e9", borderRadius: 8, padding: "4px 12px", fontSize: 13, color: "#27ae60", fontWeight: 600 }}>
                {leaderboard.length} players · {seasonData.length} records
              </div>
            </div>

            {/* Top 3 Podium */}
            {leaderboard.length === 0 ? <EmptyState /> : (
              <>
                {leaderboard.length >= 1 && (
                  <div style={{ display: "flex", gap: 12, marginBottom: "1.5rem", flexWrap: "wrap" }}>
                    {leaderboard.slice(0, 3).map((p, i) => (
                      <div key={p.player_id} onClick={() => openProfile(p)} style={{ flex: "1 1 140px", minWidth: 140, background: "#fff", border: `2px solid ${["#f1c40f", "#bdc3c7", "#cd7f32"][i]}40`, borderRadius: 14, padding: "1rem", textAlign: "center", cursor: "pointer", position: "relative", overflow: "hidden", transition: "transform .15s", boxShadow: i === 0 ? "0 4px 16px rgba(241,196,15,0.15)" : "none" }}
                        onMouseEnter={e => e.currentTarget.style.transform = "translateY(-3px)"}
                        onMouseLeave={e => e.currentTarget.style.transform = ""}>
                        <div style={{ position: "absolute", top: 8, right: 10, fontSize: 20 }}>{TROPHY_ICONS[i]}</div>
                        <div style={{ width: 44, height: 44, borderRadius: "50%", background: WIND_COLORS[season].bg + "22", border: `2px solid ${WIND_COLORS[season].bg}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px", fontSize: 18, fontWeight: 900, color: WIND_COLORS[season].bg }}>
                          {p.player_name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: "#1a3a1a", marginBottom: 2 }}>{p.player_name}</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: WIND_COLORS[season].bg }}>{p.total_pt > 0 ? "+" : ""}{p.total_pt.toFixed(1)}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>PT · {p.games} games</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Full Leaderboard Table */}
                <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #c8e6c9", overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #e8f5e9", background: "#f0faf0", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, color: "#1a5c2a", fontSize: 14 }}>🏆 Full Leaderboard</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                      <thead>
                        <tr style={{ background: "#f8fcf8" }}>
                          {["#", "Player", "PT", "Score", "Games", "Avg PT"].map((h) => (
                            <th key={h} style={{ padding: "10px 14px", textAlign: h === "#" || h === "Games" ? "center" : "left", color: "#7a9e7a", fontWeight: 600, fontSize: 12, borderBottom: "1px solid #e8f5e9", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboard.map((p, i) => (
                          <tr key={p.player_id} style={{ borderBottom: "0.5px solid #e8f5e9", transition: "background .15s" }}
                            onMouseEnter={e => e.currentTarget.style.background = "#f0faf0"}
                            onMouseLeave={e => e.currentTarget.style.background = ""}>
                            <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, color: i < 3 ? ["#f1c40f", "#bdc3c7", "#cd7f32"][i] : "#aaa", fontSize: i < 3 ? 18 : 14 }}>
                              {i < 3 ? TROPHY_ICONS[i] : i + 1}
                            </td>
                            <td style={{ padding: "10px 14px" }}>
                              <button onClick={() => openProfile(p)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#1a5c2a", fontWeight: 600, fontSize: 14, padding: 0, textDecoration: "underline dotted", textUnderlineOffset: 3 }}>
                                {p.player_name}
                              </button>
                            </td>
                            <td style={{ padding: "10px 14px", fontWeight: 700, color: p.total_pt >= 0 ? "#27ae60" : "#c0392b" }}>
                              {p.total_pt > 0 ? "+" : ""}{p.total_pt.toFixed(1)}
                            </td>
                            <td style={{ padding: "10px 14px", color: "#555" }}>{p.total_score.toLocaleString()}</td>
                            <td style={{ padding: "10px 14px", textAlign: "center", color: "#888" }}>{p.games}</td>
                            <td style={{ padding: "10px 14px", color: "#888" }}>
                              {p.games ? (p.total_pt / p.games).toFixed(2) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* PLAYER PROFILE PAGE */}
        {page === "profile" && selectedPlayer && (
          <div>
            <button onClick={() => setPage("home")}
              style={{ background: "#fff", border: "1.5px solid #c8e6c9", borderRadius: 8, padding: "6px 14px", marginBottom: "1rem", cursor: "pointer", color: "#27ae60", fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              ← Back to Leaderboard
            </button>

            {/* Profile Header */}
            <div style={{ background: "linear-gradient(135deg, #1a5c2a, #0e4020)", borderRadius: 16, padding: "1.5rem", marginBottom: "1.5rem", color: "#fff", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1.5rem" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#27ae60", border: "3px solid #a8d5a8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 900, flexShrink: 0 }}>
                {selectedPlayer.player_name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{selectedPlayer.player_name}</div>
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {[
                  { label: "Games", val: profileStats.total },
                  { label: "Total PT", val: profileStats.totalPt > 0 ? "+" + profileStats.totalPt.toFixed(1) : profileStats.totalPt.toFixed(1) },
                  { label: "Avg PT", val: profileStats.avg },
                ].map((s) => (
                  <div key={s.label} style={{ textAlign: "center", background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 16px" }}>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{s.val}</div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Filters */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #c8e6c9", padding: "1rem 1.25rem", marginBottom: "1.25rem" }}>
              <div style={{ fontWeight: 700, color: "#1a5c2a", marginBottom: 10, fontSize: 13 }}>🔎 Filters</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span style={{ color: "#888" }}>From</span>
                  <input type="date" value={profileDateFrom} onChange={(e) => setProfileDateFrom(e.target.value)}
                    style={{ border: "1.5px solid #c8e6c9", borderRadius: 8, padding: "5px 10px", fontSize: 13, color: "#1a3a1a", background: "#f8fcf8" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span style={{ color: "#888" }}>To</span>
                  <input type="date" value={profileDateTo} onChange={(e) => setProfileDateTo(e.target.value)}
                    style={{ border: "1.5px solid #c8e6c9", borderRadius: 8, padding: "5px 10px", fontSize: 13, color: "#1a3a1a", background: "#f8fcf8" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span style={{ color: "#888" }}>Opponent</span>
                  <select value={profileOpponent} onChange={(e) => setProfileOpponent(e.target.value)}
                    style={{ border: "1.5px solid #c8e6c9", borderRadius: 8, padding: "5px 10px", fontSize: 13, color: "#1a3a1a", background: "#f8fcf8" }}>
                    <option value="">All opponents</option>
                    {opponents.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                {(profileDateFrom || profileDateTo || profileOpponent) && (
                  <button onClick={() => { setProfileDateFrom(""); setProfileDateTo(""); setProfileOpponent(""); }}
                    style={{ background: "#fdf0ef", border: "1px solid #f5c6c6", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", color: "#c0392b", fontWeight: 600 }}>
                    Clear filters
                  </button>
                )}
              </div>
            </div>

            {/* Pie Chart + Stats */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1.25rem", marginBottom: "1.25rem" }}>
              <div style={{ flex: "1 1 260px", background: "#fff", borderRadius: 12, border: "1.5px solid #c8e6c9", padding: "1rem 1.25rem" }}>
                <div style={{ fontWeight: 700, color: "#1a5c2a", marginBottom: 12, fontSize: 13 }}>📊 Rank Distribution</div>
                {filteredProfileGames.length === 0 ? <EmptyState /> : <PieChart rankCounts={rankCounts} />}
              </div>
              <div style={{ flex: "1 1 180px", background: "#fff", borderRadius: 12, border: "1.5px solid #c8e6c9", padding: "1rem 1.25rem" }}>
                <div style={{ fontWeight: 700, color: "#1a5c2a", marginBottom: 12, fontSize: 13 }}>📈 Summary</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { label: "Total Games", val: profileStats.total, color: "#1a5c2a" },
                    { label: "Total Score", val: profileStats.totalScore.toLocaleString(), color: "#2980b9" },
                    { label: "Total PT", val: (profileStats.totalPt > 0 ? "+" : "") + profileStats.totalPt.toFixed(1), color: profileStats.totalPt >= 0 ? "#27ae60" : "#c0392b" },
                    { label: "Avg PT/Game", val: profileStats.avg, color: "#e67e22" },
                  ].map((s) => (
                    <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "0.5px solid #e8f5e9" }}>
                      <span style={{ fontSize: 13, color: "#888" }}>{s.label}</span>
                      <span style={{ fontWeight: 700, fontSize: 15, color: s.color }}>{s.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Game History Table */}
            <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #c8e6c9", overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #e8f5e9", background: "#f0faf0", fontWeight: 700, color: "#1a5c2a", fontSize: 14 }}>
                📋 Game History ({filteredProfileGames.length} games)
              </div>
              {filteredProfileGames.length === 0 ? <EmptyState /> : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f8fcf8" }}>
                        {["Date", "Game ID", "Player", "Seat", "Rank", "Score", "PT"].map((h) => (
                          <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: "#7a9e7a", fontWeight: 600, fontSize: 12, borderBottom: "1px solid #e8f5e9", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProfileGames.flatMap((gameRow, i) => {
                        const d = gameRow.start_time ? new Date(gameRow.start_time) : null;
                        const dateStr = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : gameRow.start_time;
                        const players = gameAllPlayers[gameRow.game_id] || [gameRow];
                        return players.map((r, j) => {
                          const rank = Number(r.player_rank);
                          const pt = Number(r.player_pt);
                          const isMe = String(r.player_id || r.player_name) === String(selectedPlayer.player_id);
                          const isLast = j === players.length - 1;
                          return (
                            <tr key={`${i}-${j}`} style={{ borderBottom: isLast ? "2px solid #c8e6c9" : "0.5px solid #f0f8f0", background: isMe ? "#eafaf1" : "transparent" }}>
                              {j === 0 && (
                                <>
                                  <td rowSpan={players.length} style={{ padding: "9px 12px", color: "#888", whiteSpace: "nowrap", verticalAlign: "middle", borderRight: "1px solid #e8f5e9" }}>{dateStr}</td>
                                  <td rowSpan={players.length} style={{ padding: "9px 12px", verticalAlign: "middle", borderRight: "1px solid #e8f5e9" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <span style={{ fontFamily: "monospace", fontSize: 11, color: "#888", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.game_id}</span>
                                      <CopyButton text={r.game_id} />
                                    </div>
                                  </td>
                                </>
                              )}
                              <td style={{ padding: "9px 12px", fontWeight: isMe ? 700 : 400, color: isMe ? "#1a5c2a" : "#444" }}>
                                {isMe ? <span>★ {r.player_name}</span> : r.player_name}
                              </td>
                              <td style={{ padding: "9px 12px", color: "#888" }}>{r.player_seat}</td>
                              <td style={{ padding: "9px 12px" }}>
                                {rank >= 1 && rank <= 4 ? (
                                  <span style={{ background: RANK_BG[rank - 1], color: RANK_COLORS[rank - 1], borderRadius: 20, padding: "2px 10px", fontWeight: 700, fontSize: 12 }}>
                                    {RANK_LABELS[rank - 1]}
                                  </span>
                                ) : r.player_rank}
                              </td>
                              <td style={{ padding: "9px 12px", color: "#555" }}>{(Number(r.player_score) - 25000).toLocaleString()}</td>
                              <td style={{ padding: "9px 12px", fontWeight: 700, color: pt >= 0 ? "#27ae60" : "#c0392b" }}>
                                {pt > 0 ? "+" : ""}{pt.toFixed(1)}
                              </td>
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer style={{ textAlign: "center", padding: "2rem", color: "#7a9e7a", fontSize: 12, marginTop: "2rem", borderTop: "1px solid #c8e6c9" }}>
        🀄 MJGT · Mahjong Together · Riichi Mahjong Community
      </footer>
    </div>
  );
}
