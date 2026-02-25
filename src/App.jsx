import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Star, Award, Film, Trophy, Popcorn, Search, CheckCircle2, Circle, Sparkles, Settings, ImageIcon, ArrowUpDown, Calendar, Clock, PlayCircle, ThumbsUp, ThumbsDown, Medal, Flame, Users, Clapperboard, Database, RefreshCw, Trash2, Zap } from 'lucide-react';

// ============================================================================
// LOCAL STORAGE PERSISTENCE (replaces Firebase)
// ============================================================================
const PROGRESS_KEY = 'oscar-tracker-progress';
const OMDB_CACHE_KEY = 'oscar-tracker-omdb-cache';

function loadFromStorage(key, fallback = {}) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function saveToStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

// --- MOCK DATA ---
const INITIAL_MOVIES = [
  { id: 'oppenheimer-2023', title: 'Oppenheimer', year: 2023, nominations: 13, wins: 7, runtime: 180, blurb: 'The story of American scientist, J. Robert Oppenheimer, and his role in the development of the atomic bomb.', imdb: 'tt15398776' },
  { id: 'poor-things-2023', title: 'Poor Things', year: 2023, nominations: 11, wins: 4, runtime: 141, blurb: 'The incredible tale about the fantastical evolution of Bella Baxter...', imdb: 'tt14230458' },
  { id: 'eeaao-2022', title: 'Everything Everywhere All at Once', year: 2022, nominations: 11, wins: 7, runtime: 139, blurb: 'A middle-aged Chinese immigrant is swept up into an insane adventure across other universes.', imdb: 'tt6710474' },
  { id: 'dune-2021', title: 'Dune', year: 2021, nominations: 10, wins: 6, runtime: 155, blurb: 'A noble family becomes embroiled in a war for control over the galaxy...', imdb: 'tt1160419' },
  { id: 'parasite-2019', title: 'Parasite', year: 2019, nominations: 6, wins: 4, runtime: 132, blurb: 'Greed and class discrimination threaten the newly formed symbiotic relationship...', imdb: 'tt6751668' },
  { id: 'mad-max-2015', title: 'Mad Max: Fury Road', year: 2015, nominations: 10, wins: 6, runtime: 120, blurb: 'In a post-apocalyptic wasteland, a woman rebels against a tyrannical ruler...', imdb: 'tt1392190' },
  { id: 'gravity-2013', title: 'Gravity', year: 2013, nominations: 10, wins: 7, runtime: 91, blurb: 'Two astronauts work together to survive after an accident leaves them stranded in space.', imdb: 'tt1454468' },
  { id: 'shawshank-1994', title: 'The Shawshank Redemption', year: 1994, nominations: 7, wins: 0, runtime: 142, blurb: 'A banker convicted of uxoricide forms a friendship over a quarter century...', imdb: 'tt0111161' },
  { id: 'dark-knight-2008', title: 'The Dark Knight', year: 2008, nominations: 8, wins: 2, runtime: 152, blurb: 'When the menace known as the Joker wreaks havoc and chaos...', imdb: 'tt0468569' },
  { id: 'la-la-land-2016', title: 'La La Land', year: 2016, nominations: 14, wins: 6, runtime: 128, blurb: 'While navigating their careers in Los Angeles, a pianist and an actress fall in love...', imdb: 'tt3783958' }
];

// --- LOGIC ---
const calculateXP = (movie, jesperSeen, kimSeen) => {
  const multiplier = 1 + (movie.nominations * 0.10) + (movie.wins * 0.25);
  const jesperBase = jesperSeen ? (kimSeen ? 6 : 5) : 0;
  const kimBase = kimSeen ? (jesperSeen ? 6 : 5) : 0;

  const jesperXp = Math.round(jesperBase * multiplier);
  const kimXp = Math.round(kimBase * multiplier);
  const totalXp = jesperXp + kimXp;
  
  const maxPotential = Math.round(6 * multiplier) * 2;
  return { jesper: jesperXp, kim: kimXp, total: totalXp, multiplier: multiplier.toFixed(2), maxPotential, remainingPotential: maxPotential - totalXp };
};

const getLevelInfo = (percentage) => {
  if (percentage >= 100) return { name: "The Academy", threshold: 100, color: "text-amber-300" };
  if (percentage >= 75) return { name: "Critic", threshold: 75, color: "text-yellow-400" };
  if (percentage >= 50) return { name: "Cinephile", threshold: 50, color: "text-slate-300" };
  if (percentage >= 25) return { name: "Couch Potato", threshold: 25, color: "text-amber-600" };
  return { name: "Starting Out", threshold: 0, color: "text-slate-500" };
};

export default function App() {
  const [progress, setProgress] = useState(() => loadFromStorage(PROGRESS_KEY));
  const [omdbCache, setOmdbCache] = useState(() => loadFromStorage(OMDB_CACHE_KEY));
  const [loading] = useState(false);
  const [activeTab, setActiveTab] = useState('movies');
  
  const [omdbKey, setOmdbKey] = useState(() => localStorage.getItem('omdbKey') || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all');
  const [selectedYear, setSelectedYear] = useState('all');
  const [sortBy, setSortBy] = useState('year-desc');
  
  const [showConfetti, setShowConfetti] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false); 
  const previousLevelsRef = useRef({});
  const fetchingRefs = useRef(new Set()); 

  const handleSaveOmdbKey = (key) => {
    setOmdbKey(key);
    localStorage.setItem('omdbKey', key);
  };

  // --- MERGE LOCAL ARRAY WITH CACHED OMDB DATA ---
  const mergedMovies = useMemo(() => {
    return INITIAL_MOVIES.map(movie => {
      const cached = omdbCache[movie.imdb];
      if (cached) {
        return {
          ...movie,
          runtime: cached.Runtime && cached.Runtime !== 'N/A' ? parseInt(cached.Runtime) : movie.runtime,
          plot: cached.Plot && cached.Plot !== 'N/A' ? cached.Plot : movie.blurb,
          poster: cached.Poster && cached.Poster !== 'N/A' ? cached.Poster : null,
          genre: cached.Genre !== 'N/A' ? cached.Genre : null,
          director: cached.Director !== 'N/A' ? cached.Director : null,
          actors: cached.Actors !== 'N/A' ? cached.Actors : null,
          imdbRating: cached.imdbRating !== 'N/A' ? cached.imdbRating : null,
          hasCache: true
        };
      }
      return { ...movie, hasCache: false };
    });
  }, [omdbCache]);

  const availableYears = useMemo(() => {
    const years = mergedMovies.map(m => m.year);
    return [...new Set(years)].sort((a, b) => b - a);
  }, [mergedMovies]);

  // --- PERSIST PROGRESS TO LOCAL STORAGE ---
  useEffect(() => {
    if (Object.keys(progress).length > 0) {
      saveToStorage(PROGRESS_KEY, progress);
    }
  }, [progress]);

  // --- PERSIST OMDB CACHE TO LOCAL STORAGE ---
  useEffect(() => {
    if (Object.keys(omdbCache).length > 0) {
      saveToStorage(OMDB_CACHE_KEY, omdbCache);
    }
  }, [omdbCache]);

  // --- BACKGROUND BATCH FETCHER WITH VALIDATION ---
  useEffect(() => {
    if (!omdbKey) return;
    
    const missingMovies = INITIAL_MOVIES.filter(m => !omdbCache[m.imdb]);
    if (missingMovies.length === 0) return;

    let isCancelled = false;

    const fetchMissing = async () => {
      for (const movie of missingMovies) {
        if (isCancelled) break;
        if (fetchingRefs.current.has(movie.imdb)) continue; 

        fetchingRefs.current.add(movie.imdb);
        
        try {
          const res = await fetch(`https://www.omdbapi.com/?i=${movie.imdb}&apikey=${omdbKey}&plot=short`);
          const data = await res.json();
          
          if (data.Response === "True" && data.imdbID === movie.imdb && !isCancelled) {
            setOmdbCache(prev => ({
              ...prev,
              [movie.imdb]: { ...data, _cachedAt: new Date().toISOString() }
            }));
          }
        } catch (error) {
          console.error("Background fetch failed for", movie.imdb, error);
        }
        
        await new Promise(r => setTimeout(r, 600));
        fetchingRefs.current.delete(movie.imdb);
      }
    };

    fetchMissing();
    return () => { isCancelled = true; };
  }, [omdbKey, omdbCache]);

  // --- CLEAR CACHE LOGIC ---
  const handleClearCache = async (imdbId = null) => {
    if (imdbId) {
      setOmdbCache(prev => {
        const next = { ...prev };
        delete next[imdbId];
        saveToStorage(OMDB_CACHE_KEY, next);
        return next;
      });
    } else {
      setIsClearingCache(true);
      setOmdbCache({});
      saveToStorage(OMDB_CACHE_KEY, {});
      setIsClearingCache(false);
    }
  };

  // --- LEVEL UP CHECK ---
  useEffect(() => {
    if (loading || Object.keys(progress).length === 0) return;

    let leveledUp = false;
    const yearStats = {};

    mergedMovies.forEach(movie => {
      if (!yearStats[movie.year]) yearStats[movie.year] = { current: 0, max: 0 };
      const p = progress[movie.id] || { jesper: false, kim: false };
      const xp = calculateXP(movie, p.jesper, p.kim);
      yearStats[movie.year].current += xp.total;
      yearStats[movie.year].max += xp.maxPotential;
    });

    Object.keys(yearStats).forEach(year => {
      const stat = yearStats[year];
      const pct = (stat.current / stat.max) * 100;
      const currentLevel = getLevelInfo(pct).threshold;
      
      const prevLevel = previousLevelsRef.current[year] || 0;
      if (currentLevel > prevLevel && stat.current > 0 && previousLevelsRef.current[year] !== undefined) {
        leveledUp = true;
      }
      previousLevelsRef.current[year] = currentLevel;
    });

    if (leveledUp) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 4000); 
    }
  }, [progress, loading, mergedMovies]);

  // --- ACTIONS (localStorage-backed) ---
  const handleToggle = (movieId, person) => {
    const currentData = progress[movieId] || { jesper: false, kim: false, jesperRating: null, kimRating: null };
    const newData = { ...currentData, [person]: !currentData[person] };
    if (!newData[person]) newData[`${person}Rating`] = null;
    setProgress(prev => ({ ...prev, [movieId]: newData }));
  };

  const handleRating = (movieId, person, ratingValue) => {
    const currentData = progress[movieId] || { jesper: false, kim: false };
    const ratingKey = `${person}Rating`;
    const newRating = currentData[ratingKey] === ratingValue ? null : ratingValue;
    const newData = { ...currentData, [ratingKey]: newRating };
    setProgress(prev => ({ ...prev, [movieId]: newData }));
  };

  // --- DERIVED DATA ---
  const stats = useMemo(() => {
    let jesperTotal = 0, kimTotal = 0, teamTotal = 0;
    const yearStats = {};

    mergedMovies.forEach(movie => {
      const p = progress[movie.id] || { jesper: false, kim: false };
      const xp = calculateXP(movie, p.jesper, p.kim);
      
      jesperTotal += xp.jesper; kimTotal += xp.kim; teamTotal += xp.total;

      if (!yearStats[movie.year]) yearStats[movie.year] = { current: 0, max: 0 };
      yearStats[movie.year].current += xp.total;
      yearStats[movie.year].max += xp.maxPotential;
    });

    const sortedYears = Object.entries(yearStats)
      .map(([year, data]) => ({ year, xp: data.current, max: data.max, pct: (data.current/data.max)*100 }))
      .sort((a, b) => b.xp - a.xp);

    return { jesperTotal, kimTotal, teamTotal, sortedYears };
  }, [progress, mergedMovies]);

  const badges = useMemo(() => {
    const unlocked = [];
    const nightOwls = mergedMovies.some(m => m.runtime >= 180 && progress[m.id]?.jesper && progress[m.id]?.kim);
    if (nightOwls) unlocked.push({ id: 'night', title: 'Night Owls', desc: 'Watched a 3h+ movie together.', icon: <Clock /> });

    const shortMovies = mergedMovies.filter(m => m.runtime < 120 && progress[m.id]?.jesper && progress[m.id]?.kim).length;
    if (shortMovies >= 3) unlocked.push({ id: 'short', title: 'Parent Hacks', desc: 'Watched 3 movies under 2 hours.', icon: <Flame /> });

    const agreedCount = mergedMovies.filter(m => {
      const p = progress[m.id];
      return p?.jesperRating && p?.kimRating && p.jesperRating === p.kimRating;
    }).length;
    if (agreedCount >= 3) unlocked.push({ id: 'agree', title: 'Perfect Harmony', desc: 'Gave the same rating on 3 movies.', icon: <ThumbsUp /> });

    const reachedCritic = stats.sortedYears.some(y => y.pct >= 75);
    if (reachedCritic) unlocked.push({ id: 'critic', title: 'Cinephiles', desc: 'Reached the Critic level (75%) for a year.', icon: <Medal /> });

    const oldies = mergedMovies.filter(m => m.year <= 2010 && progress[m.id]?.jesper && progress[m.id]?.kim).length;
    if (oldies >= 3) unlocked.push({ id: 'time', title: 'Time Travelers', desc: 'Watched 3+ older classics (pre-2011).', icon: <Star /> });

    return unlocked;
  }, [progress, stats, mergedMovies]);

  const filteredMovies = useMemo(() => {
    let result = mergedMovies.filter(movie => {
      if (searchQuery && !movie.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (selectedYear !== 'all' && movie.year.toString() !== selectedYear.toString()) return false;

      const p = progress[movie.id] || { jesper: false, kim: false };
      switch (filterMode) {
        case 'unseen': return !p.jesper && !p.kim;
        case 'seen-both': return p.jesper && p.kim;
        case 'seen-one': return (p.jesper || p.kim) && !(p.jesper && p.kim);
        case 'short': return movie.runtime < 120;
        default: return true; 
      }
    });

    result.sort((a, b) => {
      if (sortBy === 'year-desc') return b.year - a.year;
      if (sortBy === 'year-asc') return a.year - b.year;
      if (sortBy === 'title-asc') return a.title.localeCompare(b.title);
      if (sortBy === 'xp-desc') {
        return calculateXP(b, false, false).maxPotential - calculateXP(a, false, false).maxPotential;
      }
      if (sortBy === 'xp-min-desc') {
        const pA = progress[a.id] || { jesper: false, kim: false };
        const pB = progress[b.id] || { jesper: false, kim: false };
        const xpA = calculateXP(a, pA.jesper, pA.kim);
        const xpB = calculateXP(b, pB.jesper, pB.kim);
        const valA = a.runtime > 0 ? xpA.remainingPotential / a.runtime : 0;
        const valB = b.runtime > 0 ? xpB.remainingPotential / b.runtime : 0;
        return valB - valA;
      }
      return 0;
    });

    return result;
  }, [progress, searchQuery, filterMode, selectedYear, sortBy, mergedMovies]);

  const top10 = useMemo(() => {
    return mergedMovies
      .filter(movie => {
        const p = progress[movie.id] || { jesper: false, kim: false };
        return !(p.jesper && p.kim); 
      })
      .map(movie => {
        const p = progress[movie.id] || { jesper: false, kim: false };
        const xp = calculateXP(movie, p.jesper, p.kim);
        const xpPerMin = movie.runtime > 0 ? (xp.remainingPotential / movie.runtime).toFixed(2) : '0.00';
        return { ...movie, remainingPotential: xp.remainingPotential, xpPerMin };
      })
      .sort((a, b) => b.remainingPotential - a.remainingPotential) // Still sorting by pure total potential for "Top 10 max XP"
      .slice(0, 10);
  }, [progress, mergedMovies]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-yellow-500 gap-4">
        <Film className="animate-spin w-12 h-12" />
        <p className="tracking-widest uppercase text-sm font-bold animate-pulse">Rolling out the red carpet...</p>
      </div>
    );
  }

  const totalMovies = mergedMovies.length;
  const completedMovies = mergedMovies.filter(m => progress[m.id]?.jesper && progress[m.id]?.kim).length;
  const progressPercent = Math.round((completedMovies / totalMovies) * 100);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans pb-20 selection:bg-yellow-500/30 relative">
      
      {showConfetti && <ConfettiOverlay />}

      <header className="relative bg-gradient-to-b from-yellow-900/40 via-slate-900 to-slate-950 border-b border-yellow-500/20 pt-16 pb-10 px-4 text-center overflow-hidden">
        <div className="absolute top-[-50%] left-[-10%] w-[120%] h-[200%] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-yellow-400/10 via-transparent to-transparent animate-[pulse_8s_ease-in-out_infinite] pointer-events-none" />
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none mix-blend-overlay"></div>
        
        <div className="relative z-10 flex flex-col items-center">
          <div className="relative mb-6">
            <Trophy className="w-20 h-20 text-yellow-400 drop-shadow-[0_0_25px_rgba(250,204,21,0.6)]" />
            <Sparkles className="w-8 h-8 text-amber-200 absolute -top-2 -right-4 animate-bounce drop-shadow-[0_0_10px_rgba(253,230,138,0.8)]" />
          </div>
          
          <h1 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-yellow-100 via-yellow-500 to-amber-700 tracking-tighter uppercase mb-3 drop-shadow-sm">
            Oscar Tracker
          </h1>
          
          <div className="flex items-center gap-4 bg-black/40 px-6 py-2 rounded-full border border-yellow-500/20 backdrop-blur-sm">
            <span className="text-blue-400 font-bold uppercase tracking-wider text-sm">Jesper</span>
            <span className="text-yellow-500/50 text-xs">&</span>
            <span className="text-pink-400 font-bold uppercase tracking-wider text-sm">Kim</span>
          </div>

          <div className="mt-8 w-full max-w-md mx-auto">
            <div className="flex justify-between text-xs text-slate-400 font-medium mb-2 px-1">
              <span>{completedMovies} Movies Completed</span>
              <span>{progressPercent}% Done</span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden border border-white/5">
              <div 
                className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 rounded-full shadow-[0_0_10px_rgba(234,179,8,0.5)] transition-all duration-1000 ease-out"
                style={{ width: `${progressPercent || 0}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      <nav className="flex justify-center flex-wrap gap-2 p-4 sticky top-0 bg-slate-950/80 backdrop-blur-xl z-50 border-b border-white/10 shadow-lg shadow-black/50">
        <NavButton active={activeTab === 'movies'} onClick={() => setActiveTab('movies')} icon={<Film size={18}/>} label="Movies" />
        <NavButton active={activeTab === 'top10'} onClick={() => setActiveTab('top10')} icon={<Star size={18}/>} label="Top 10" />
        <NavButton active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} icon={<Award size={18}/>} label="Stats" />
        <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings size={18}/>} label="Settings" />
      </nav>

      <main className="max-w-7xl mx-auto p-4 pt-8">
        
        {/* TAB: FILMER */}
        {activeTab === 'movies' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center bg-slate-900/50 p-4 rounded-3xl border border-white/5 shadow-inner">
              <div className="relative w-full xl:w-80 shrink-0">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
                <input 
                  type="text" 
                  placeholder="Search by title..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-slate-200 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50 transition-all placeholder:text-slate-600"
                />
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto items-stretch sm:items-center">
                <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800 shrink-0 overflow-x-auto max-w-full custom-scrollbar">
                  <FilterButton active={filterMode === 'all'} onClick={() => setFilterMode('all')} label="All" />
                  <FilterButton active={filterMode === 'unseen'} onClick={() => setFilterMode('unseen')} label="Unseen" />
                  <FilterButton active={filterMode === 'seen-one'} onClick={() => setFilterMode('seen-one')} label="One Seen" />
                  <FilterButton active={filterMode === 'seen-both'} onClick={() => setFilterMode('seen-both')} label="Completed" />
                  <FilterButton active={filterMode === 'short'} onClick={() => setFilterMode('short')} label="< 2h (Short)" highlight />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                  <div className="relative w-full sm:w-32 shrink-0">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4 pointer-events-none" />
                    <select 
                      value={selectedYear} 
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="w-full appearance-none bg-slate-950 border border-slate-800 rounded-2xl py-2.5 pl-9 pr-8 text-sm text-slate-300 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50 cursor-pointer"
                    >
                      <option value="all">All Years</option>
                      {availableYears.map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <ArrowUpDown size={14} className="text-slate-600" />
                    </div>
                  </div>

                  <div className="relative w-full sm:w-52 shrink-0">
                    <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4 pointer-events-none" />
                    <select 
                      value={sortBy} 
                      onChange={(e) => setSortBy(e.target.value)}
                      className="w-full appearance-none bg-slate-950 border border-slate-800 rounded-2xl py-2.5 pl-9 pr-8 text-sm text-slate-300 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50 cursor-pointer"
                    >
                      <option value="year-desc">Year (Newest)</option>
                      <option value="year-asc">Year (Oldest)</option>
                      <option value="xp-desc">Potential Max XP</option>
                      <option value="xp-min-desc">XP/Min (Best Value)</option>
                      <option value="title-asc">Title (A-Z)</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <ArrowUpDown size={14} className="text-slate-600" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-sm text-slate-500 px-2 font-medium flex justify-between">
              <span>Showing <span className="text-yellow-500">{filteredMovies.length}</span> of {totalMovies} movies</span>
            </div>

            {filteredMovies.length === 0 ? (
              <div className="text-center py-20 text-slate-500 bg-slate-900/30 rounded-3xl border border-white/5 border-dashed">
                <Popcorn className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p>No movies found matching your filters.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredMovies.map(movie => (
                  <MovieCard 
                    key={movie.id} 
                    movie={movie} 
                    progress={progress[movie.id] || { jesper: false, kim: false, jesperRating: null, kimRating: null }}
                    onToggle={handleToggle}
                    onRating={handleRating}
                    onClearCache={handleClearCache}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: TOP 10 */}
        {activeTab === 'top10' && (
          <div className="space-y-4 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-10 bg-slate-900/50 p-6 rounded-3xl border border-white/5">
              <Sparkles className="w-10 h-10 text-yellow-500 mx-auto mb-3" />
              <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-amber-500 mb-3">
                XP-Optimized Picks
              </h2>
              <p className="text-slate-400 text-sm max-w-lg mx-auto leading-relaxed">
                These are the movies you should watch next to maximize your score! The list is sorted by the amount of <strong className="text-yellow-500 font-bold">Remaining XP</strong> you can grab.
              </p>
            </div>
            
            {top10.map((movie, index) => (
              <div key={movie.id} className="group relative flex bg-gradient-to-r from-slate-900 to-slate-900/50 border border-slate-800 rounded-2xl p-5 items-center gap-4 sm:gap-5 hover:border-yellow-500/30 hover:shadow-[0_0_30px_rgba(234,179,8,0.05)] transition-all overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-yellow-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <div className="text-3xl sm:text-4xl font-black text-slate-800 w-10 sm:w-12 text-center group-hover:text-yellow-500/20 transition-colors">
                  {index + 1}
                </div>
                
                <div className="flex-1">
                  <h3 className="text-lg sm:text-xl font-bold text-slate-100 mb-1">
                    {movie.title} <span className="text-xs sm:text-sm font-medium text-slate-500 ml-2 bg-slate-950 px-2 py-0.5 rounded-md border border-white/5">{movie.year}</span>
                  </h3>
                  <div className="flex flex-wrap gap-3 sm:gap-4 text-xs font-semibold text-amber-500/80 mt-2">
                    <span className="flex items-center gap-1.5"><Star size={14} /> {movie.nominations} Nom</span>
                    <span className="flex items-center gap-1.5"><Award size={14} /> {movie.wins} Wins</span>
                    <span className="flex items-center gap-1.5 text-slate-400"><Clock size={14} /> {movie.runtime} min</span>
                  </div>
                </div>
                
                <div className="text-right flex flex-col items-end shrink-0">
                  <div className="text-[10px] sm:text-xs uppercase tracking-wider font-bold text-slate-500 mb-1">Remaining XP</div>
                  <div className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br from-yellow-300 to-yellow-600">
                    +{movie.remainingPotential}
                  </div>
                  <div className="text-xs font-bold text-yellow-500/60 mt-1 flex items-center gap-1">
                    <Zap size={12} /> {movie.xpPerMin} / min
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB: STATS */}
        {activeTab === 'stats' && (
          <div className="space-y-10 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard title="Team XP (Total)" value={stats.teamTotal} icon={<Trophy className="text-yellow-400 w-10 h-10" />} isMain />
              <StatCard title="Jesper XP" value={stats.jesperTotal} icon={<Popcorn className="text-blue-400 w-8 h-8" />} colorClass="text-blue-400" />
              <StatCard title="Kim XP" value={stats.kimTotal} icon={<Popcorn className="text-pink-400 w-8 h-8" />} colorClass="text-pink-400" />
            </div>

            {/* BADGES / TROFÉSKÅP */}
            <div className="bg-slate-900/50 rounded-3xl p-8 border border-white/5 shadow-inner">
              <h3 className="text-xl font-black text-slate-200 mb-6 flex items-center gap-3">
                <Medal className="text-yellow-500"/> Trophy Cabinet
              </h3>
              
              {badges.length === 0 ? (
                <div className="text-center py-10 text-slate-600 border border-dashed border-slate-700 rounded-2xl">
                  <p>Nothing unlocked yet. Keep watching!</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {badges.map(b => (
                    <div key={b.id} className="bg-gradient-to-br from-slate-800 to-slate-900 border border-yellow-500/30 rounded-2xl p-4 flex flex-col items-center text-center group hover:border-yellow-400 transition-colors shadow-lg">
                      <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-500 mb-3 group-hover:scale-110 transition-transform">
                        {b.icon}
                      </div>
                      <h4 className="font-bold text-slate-200 text-sm mb-1">{b.title}</h4>
                      <p className="text-xs text-slate-400 leading-tight">{b.desc}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Maktbalans */}
            <div className="relative bg-gradient-to-r from-slate-900 via-slate-900 to-slate-900 rounded-3xl p-8 border border-white/5 text-center overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 mix-blend-overlay pointer-events-none"></div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-4">Current Balance of Power</h3>
              
              {stats.jesperTotal === stats.kimTotal ? (
                <div className="flex flex-col items-center">
                  <div className="flex gap-4 mb-4">
                    <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center border-2 border-blue-500/50"><span className="text-2xl">👨</span></div>
                    <div className="w-16 h-16 rounded-full bg-pink-500/20 flex items-center justify-center border-2 border-pink-500/50"><span className="text-2xl">👩</span></div>
                  </div>
                  <p className="text-3xl font-black text-yellow-500">It's a perfect tie!</p>
                  <p className="text-slate-400 mt-2">You are perfectly synced. Great job!</p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 border-4 shadow-xl ${stats.jesperTotal > stats.kimTotal ? 'bg-blue-500/20 border-blue-400 shadow-blue-500/20' : 'bg-pink-500/20 border-pink-400 shadow-pink-500/20'}`}>
                    <span className="text-4xl">{stats.jesperTotal > stats.kimTotal ? '👨' : '👩'}</span>
                  </div>
                  <p className="text-3xl font-black text-slate-100">
                    <span className={stats.jesperTotal > stats.kimTotal ? "text-blue-400" : "text-pink-400"}>
                      {stats.jesperTotal > stats.kimTotal ? "Jesper" : "Kim"}
                    </span> leads by <span className="text-yellow-500">{Math.abs(stats.jesperTotal - stats.kimTotal)} XP!</span>
                  </p>
                  <p className="text-slate-400 mt-2">Time for the other to grab some popcorn and catch up.</p>
                </div>
              )}
            </div>

            {/* Årskampen */}
            <div className="bg-slate-900 rounded-3xl p-8 border border-white/5">
              <h3 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-yellow-500 mb-8 flex items-center gap-3">
                <Film className="text-yellow-500"/> Yearly Progress Levels
              </h3>
              <div className="space-y-6">
                {stats.sortedYears.map(({ year, xp, pct }, index) => {
                  const level = getLevelInfo(pct);
                  return (
                    <div key={year} className="group">
                      <div className="flex justify-between items-end mb-1.5 px-1">
                        <div className="font-black text-slate-300">{year} <span className="text-xs font-normal text-slate-500 ml-2">Total: {xp} XP</span></div>
                        <div className={`text-xs font-bold uppercase tracking-wider ${level.color}`}>
                          Level: {level.name} ({Math.round(pct)}%)
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex-1 h-6 bg-slate-950 rounded-full overflow-hidden border border-white/5 relative">
                          <div className="absolute left-[25%] top-0 bottom-0 w-px bg-white/10 z-10"></div>
                          <div className="absolute left-[50%] top-0 bottom-0 w-px bg-white/10 z-10"></div>
                          <div className="absolute left-[75%] top-0 bottom-0 w-px bg-white/10 z-10"></div>
                          
                          <div 
                            className="absolute left-0 top-0 h-full bg-gradient-to-r from-yellow-700 via-yellow-500 to-amber-300 rounded-full transition-all duration-1000"
                            style={{ width: `${pct}%` }}
                          >
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 mix-blend-overlay"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}

        {/* TAB: SETTINGS */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
            
            <div className="bg-slate-900/80 rounded-3xl p-8 border border-white/5">
              <div className="flex items-center gap-4 mb-2">
                <div className="bg-yellow-500/10 p-3 rounded-2xl border border-yellow-500/20">
                  <Database className="text-yellow-500 w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-100">Global Cloud Cache</h2>
                  <p className="text-sm text-slate-400">Manage OMDb API connection and background syncing.</p>
                </div>
              </div>
              
              <div className="space-y-4 text-slate-300 text-sm leading-relaxed mt-6">
                
                {/* Cache Status Badge */}
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase font-bold text-slate-500 tracking-wider mb-1">Cache Status</div>
                    <div className="text-lg font-black text-slate-200">
                      {Object.keys(omdbCache).length} / {INITIAL_MOVIES.length} <span className="text-sm font-medium text-slate-400">movies cached</span>
                    </div>
                  </div>
                  {Object.keys(omdbCache).length < INITIAL_MOVIES.length ? (
                    omdbKey ? <div className="animate-pulse text-yellow-500 flex items-center gap-1.5 text-xs font-bold"><Database size={14} /> Syncing...</div> : <div className="text-red-400 text-xs font-bold">Needs API Key</div>
                  ) : (
                    <div className="text-green-400 flex items-center gap-1.5 text-xs font-bold"><CheckCircle2 size={16} /> Fully Synced</div>
                  )}
                </div>

                <div className="pt-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Your OMDb API Key</label>
                  <input 
                    type="text" 
                    value={omdbKey}
                    onChange={(e) => handleSaveOmdbKey(e.target.value)}
                    placeholder="e.g. a1b2c3d4"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 px-4 text-slate-200 focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all font-mono mb-2"
                  />
                  {omdbKey && (
                    <p className="text-green-500 text-xs flex items-center gap-1.5 font-medium">
                      <CheckCircle2 size={16} /> Key saved.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-slate-900/80 rounded-3xl p-8 border border-red-900/30">
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-red-500/10 p-3 rounded-2xl border border-red-500/20">
                  <Trash2 className="text-red-400 w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-100">Danger Zone</h2>
                  <p className="text-sm text-slate-400">Clear the cached movie data.</p>
                </div>
              </div>
              <p className="text-sm text-slate-400 mb-6">
                If the movie data looks wrong, you can force the app to re-fetch all data from OMDb by clearing the global cache. This will not affect your XP or watch progress.
              </p>
              <button 
                onClick={() => handleClearCache()}
                disabled={isClearingCache || Object.keys(omdbCache).length === 0}
                className="w-full sm:w-auto px-6 py-3 bg-red-950/40 text-red-400 border border-red-900/50 font-bold rounded-xl hover:bg-red-900/60 hover:text-red-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isClearingCache ? <RefreshCw className="animate-spin" size={18} /> : <Trash2 size={18} />}
                Clear Entire Cache
              </button>
            </div>

          </div>
        )}

      </main>
    </div>
  );
}

// --- SUBCOMPONENTS ---

function ConfettiOverlay() {
  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {Array.from({ length: 50 }).map((_, i) => {
        const left = Math.random() * 100;
        const animDuration = 1.5 + Math.random() * 2;
        const delay = Math.random() * 0.5;
        const color = ['bg-yellow-400', 'bg-yellow-200', 'bg-amber-500', 'bg-white'][Math.floor(Math.random() * 4)];
        const shape = Math.random() > 0.5 ? 'rounded-full' : 'rounded-sm';
        
        return (
          <div 
            key={i}
            className={`absolute top-[-5%] w-2 h-2 sm:w-3 sm:h-3 ${color} ${shape} animate-confetti-fall`}
            style={{ 
              left: `${left}%`, 
              animationDuration: `${animDuration}s`,
              animationDelay: `${delay}s` 
            }}
          />
        );
      })}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        .animate-confetti-fall { animation-name: confetti-fall; animation-fill-mode: forwards; animation-timing-function: cubic-bezier(.37,0,.63,1); }
        .custom-scrollbar::-webkit-scrollbar { height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
      `}} />
    </div>
  );
}

function OscarStatue({ filled, className }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      className={className} 
      fill={filled ? "currentColor" : "none"} 
      stroke="currentColor" 
      strokeWidth={filled ? "1" : "1.5"}
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <circle cx="12" cy="4" r="2.5" />
      <path d="M10 7.5l-1 10.5h6l-1-10.5Z" />
      <path d="M9 18h6v1.5H9z" />
      <path d="M8 19.5h8v2H8z" />
      <path d="M12 7.5v10" />
      <path d="M10 10.5h4" />
    </svg>
  );
}

function NavButton({ active, onClick, icon, label }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 rounded-full font-bold transition-all duration-300 text-sm sm:text-base ${
        active 
          ? 'bg-gradient-to-b from-yellow-400 to-yellow-600 text-slate-950 shadow-[0_0_20px_rgba(234,179,8,0.4)] scale-105' 
          : 'bg-slate-900/50 text-slate-400 hover:text-yellow-400 hover:bg-slate-800 border border-white/5'
      }`}
    >
      {icon} <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function FilterButton({ active, onClick, label, highlight }) {
  return (
    <button 
      onClick={onClick}
      className={`px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold rounded-xl transition-colors whitespace-nowrap ${
        active 
          ? (highlight ? 'bg-amber-600 text-white shadow-inner' : 'bg-slate-700 text-white shadow-inner') 
          : 'bg-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
      }`}
    >
      {label}
    </button>
  );
}

function StatCard({ title, value, icon, isMain, colorClass = 'text-slate-100' }) {
  return (
    <div className={`relative flex flex-col items-center p-8 rounded-3xl border overflow-hidden ${isMain ? 'bg-gradient-to-br from-slate-900 to-amber-950/40 border-yellow-500/40 shadow-[0_0_40px_rgba(234,179,8,0.15)] scale-105 z-10' : 'bg-slate-900 border-white/5'}`}>
      {isMain && <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none"></div>}
      <div className="mb-4 bg-slate-950 p-4 rounded-full border border-white/5 shadow-inner">{icon}</div>
      <div className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-2 z-10">{title}</div>
      <div className={`font-black tracking-tighter z-10 ${isMain ? 'text-6xl text-transparent bg-clip-text bg-gradient-to-br from-yellow-200 to-amber-600 drop-shadow-md' : `text-5xl ${colorClass}`}`}>
        {value}
      </div>
    </div>
  );
}

function MovieCard({ movie, progress, onToggle, onRating, onClearCache }) {
  const [imgError, setImgError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const xp = calculateXP(movie, progress.jesper, progress.kim);
  const isCompleted = progress.jesper && progress.kim;
  const isStarted = progress.jesper || progress.kim;
  const isShort = movie.runtime < 120;
  
  // XP per minute calculation
  const xpPerMin = movie.runtime > 0 ? (xp.remainingPotential / movie.runtime).toFixed(2) : '0.00';

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onClearCache(movie.imdb);
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  return (
    <div className={`group relative flex flex-col bg-slate-900 rounded-3xl overflow-hidden border transition-all duration-500 ${isCompleted ? 'border-yellow-500/50 shadow-[0_0_30px_rgba(234,179,8,0.15)]' : isStarted ? 'border-slate-700' : 'border-white/5 hover:border-white/20'}`}>
      
      {isCompleted && (
        <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent pointer-events-none z-0" />
      )}
      
      <div className="relative h-80 w-full bg-slate-950 border-b border-white/5 shrink-0 overflow-hidden flex items-center justify-center">
        
        {/* Oscars Overlay Top Right */}
        <div className="absolute top-3 right-3 flex flex-wrap justify-end gap-1.5 max-w-[70%] z-20 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
          {Array.from({ length: Math.min(movie.nominations, 20) }).map((_, i) => (
            <OscarStatue 
              key={i} 
              filled={i < movie.wins} 
              className={`w-4 h-4 sm:w-5 sm:h-5 ${i < movie.wins ? 'text-yellow-400' : 'text-yellow-200/60'}`} 
            />
          ))}
        </div>

        {/* IMDb Rating Top Left */}
        {movie.imdbRating && (
          <div className="absolute top-3 left-3 z-20 bg-slate-950/80 backdrop-blur-md border border-yellow-500/30 text-yellow-500 text-xs font-black px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-lg">
            <Star className="fill-yellow-500 text-yellow-500 w-3 h-3" /> {movie.imdbRating}
          </div>
        )}

        {/* Multiplier Badge Bottom Right on Poster */}
        <div className="absolute bottom-3 right-3 z-20 bg-amber-950/90 backdrop-blur-md border border-amber-500/40 text-amber-500 text-xs font-black px-2.5 py-1 rounded-lg shadow-[0_0_15px_rgba(245,158,11,0.3)] flex items-center" title="Score Multiplier">
          x{xp.multiplier}
        </div>

        {movie.poster && !imgError ? (
          <img 
            src={movie.poster} 
            alt={`Poster for ${movie.title}`} 
            className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105 opacity-90 group-hover:opacity-100"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950 flex flex-col items-center justify-center p-6 text-center">
            <Film className="w-12 h-12 text-slate-700 mb-2" />
            <h3 className="text-xl font-black text-slate-600 uppercase tracking-widest leading-tight">{movie.title}</h3>
          </div>
        )}
        <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-slate-900 to-transparent pointer-events-none z-10" />
      </div>
      
      <div className="p-6 pt-4 flex-1 relative z-10 flex flex-col">
        <div className="flex justify-between items-start mb-2 gap-4">
          <h2 className={`text-2xl font-black leading-tight transition-colors ${isCompleted ? 'text-yellow-400' : 'text-slate-100'}`}>
            {movie.title}
          </h2>
          <span className="shrink-0 bg-slate-950 text-slate-300 border border-slate-800 text-xs font-black px-2.5 py-1.5 rounded-lg shadow-inner">
            {movie.year}
          </span>
        </div>
        
        {movie.genre && (
          <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-4">
            {movie.genre.split(', ').join(' • ')}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-4">
          <Badge icon={<Star className="w-3.5 h-3.5 text-yellow-500" />} text={`${movie.nominations} Nom`} />
          <Badge icon={<Award className="w-3.5 h-3.5 text-yellow-500" />} text={`${movie.wins} Wins`} />
          <Badge 
            icon={<Clock className={`w-3.5 h-3.5 ${isShort ? 'text-green-400' : 'text-slate-400'}`} />} 
            text={`${movie.runtime} min`} 
            highlight={isShort} 
          />
          {!isCompleted && xp.remainingPotential > 0 && (
            <Badge 
              icon={<Zap className="w-3.5 h-3.5 text-amber-400" />} 
              text={`${xpPerMin} XP/m`} 
            />
          )}
        </div>

        <p className="text-sm text-slate-400 line-clamp-3 mb-3 leading-relaxed flex-1">
          {movie.plot}
        </p>

        {movie.director && (
          <div className="mb-4 text-xs text-slate-500 border-t border-white/5 pt-3 mt-auto">
            <div className="flex items-start gap-1.5 mb-1.5">
              <Clapperboard className="w-3.5 h-3.5 text-slate-600 shrink-0 mt-0.5" />
              <span className="line-clamp-1"><strong className="text-slate-400">Dir:</strong> {movie.director}</span>
            </div>
            {movie.actors && (
              <div className="flex items-start gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-600 shrink-0 mt-0.5" />
                <span className="line-clamp-1"><strong className="text-slate-400">Cast:</strong> {movie.actors}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 mb-1 mt-auto">
          <a 
            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(movie.title + ' trailer')}`} 
            target="_blank" 
            rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 bg-slate-950 text-red-400 text-[11px] font-bold py-2.5 rounded-xl hover:bg-slate-800 transition-colors border border-white/5 hover:border-white/10"
            title="Watch Trailer on YouTube"
          >
            <PlayCircle size={14} /> Trailer
          </a>
          <a 
            href={`https://www.justwatch.com/se/sok?q=${encodeURIComponent(movie.title)}`} 
            target="_blank" 
            rel="noreferrer"
            className="flex-[1.5] flex items-center justify-center gap-1.5 bg-slate-950 text-slate-300 text-[11px] font-bold py-2.5 rounded-xl hover:bg-slate-800 transition-colors border border-white/5 hover:border-white/10"
          >
            <Search size={14} className="text-slate-500" /> Where?
          </a>
          {movie.hasCache && (
            <button 
              onClick={handleRefresh}
              className="flex items-center justify-center bg-slate-950 text-slate-500 px-3 rounded-xl hover:text-yellow-400 hover:bg-slate-800 transition-colors border border-white/5 hover:border-white/10"
              title="Refresh metadata from OMDb"
            >
              <RefreshCw size={14} className={isRefreshing ? "animate-spin text-yellow-400" : ""} />
            </button>
          )}
        </div>
      </div>

      <div className={`p-5 relative z-10 border-t ${isCompleted ? 'bg-yellow-950/20 border-yellow-500/20' : 'bg-slate-950/80 border-white/5'}`}>
        <div className="flex justify-between items-center mb-4">
          <div className="text-xs text-slate-500 uppercase tracking-widest font-black">Earned XP</div>
          <div className={`text-2xl font-black ${xp.total > 0 ? 'text-yellow-500' : 'text-slate-700'}`}>
            {xp.total} <span className="text-sm font-bold text-slate-600">/ {xp.maxPotential}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <PersonPanel 
            name="Jesper" 
            color="blue"
            seen={progress.jesper} 
            rating={progress.jesperRating}
            onToggle={() => onToggle(movie.id, 'jesper')} 
            onRating={(val) => onRating(movie.id, 'jesper', val)}
          />
          <PersonPanel 
            name="Kim" 
            color="pink"
            seen={progress.kim} 
            rating={progress.kimRating}
            onToggle={() => onToggle(movie.id, 'kim')} 
            onRating={(val) => onRating(movie.id, 'kim', val)}
          />
        </div>
      </div>
    </div>
  );
}

function Badge({ icon, text, highlight }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border ${highlight ? 'bg-green-900/20 text-green-300 border-green-500/30' : 'text-slate-300 bg-slate-800/50 border-white/5'}`}>
      {icon} {text}
    </div>
  );
}

function PersonPanel({ name, color, seen, rating, onToggle, onRating }) {
  const isBlue = color === 'blue';
  
  const baseClasses = "flex flex-col items-center justify-center py-2.5 rounded-xl border-2 transition-all duration-300 w-full relative overflow-hidden";
  const unseenClasses = "bg-slate-900/50 text-slate-500 border-slate-800 hover:border-slate-600 cursor-pointer active:scale-95";
  const seenClasses = isBlue 
    ? "bg-blue-900/20 text-blue-400 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.15)]"
    : "bg-pink-900/20 text-pink-400 border-pink-500/50 shadow-[0_0_15px_rgba(236,72,153,0.15)]";

  return (
    <div className={`flex flex-col gap-1.5 w-full`}>
      <button 
        onClick={onToggle}
        className={`${baseClasses} ${seen ? seenClasses : unseenClasses}`}
      >
        <div className="flex items-center gap-2">
          {seen ? <CheckCircle2 size={18} className="animate-in zoom-in duration-300" /> : <Circle size={18} />}
          <span className="font-black text-sm uppercase tracking-wider">{name}</span>
        </div>
      </button>

      <div className={`grid grid-cols-2 gap-1.5 transition-all duration-300 overflow-hidden ${seen ? 'h-8 opacity-100' : 'h-0 opacity-0'}`}>
        <button 
          onClick={() => onRating('up')}
          className={`flex items-center justify-center rounded-lg border transition-colors ${rating === 'up' ? (isBlue ? 'bg-blue-500 text-white border-blue-400' : 'bg-pink-500 text-white border-pink-400') : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
          title="Great movie!"
        >
          <ThumbsUp size={14} className={rating === 'up' ? 'fill-current' : ''} />
        </button>
        <button 
          onClick={() => onRating('down')}
          className={`flex items-center justify-center rounded-lg border transition-colors ${rating === 'down' ? 'bg-slate-700 text-red-400 border-red-500/50' : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
          title="Not so great..."
        >
          <ThumbsDown size={14} className={rating === 'down' ? 'fill-current mt-1' : 'mt-1'} />
        </button>
      </div>
    </div>
  );
}