const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

const BASE_URL = 'https://streamed.pk';

const manifest = {
  id: 'community.streamed.football',
  version: '1.0.0',
  name: '⚽ Football Live Streams',
  description: 'Live and upcoming football matches from streamed.pk — Premier League, Champions League, La Liga, Bundesliga, Serie A and more.',
  logo: 'https://streamed.pk/favicon.ico',
  resources: ['catalog', 'meta', 'stream'],
  types: ['tv'],
  catalogs: [
    {
      type: 'tv',
      id: 'football-live',
      name: '🔴 Live Now',
      extra: [{ name: 'skip' }],
    },
    {
      type: 'tv',
      id: 'football-all',
      name: '📅 All Matches',
      extra: [{ name: 'skip' }],
    },
  ],
  behaviorHints: {
    adult: false,
    p2p: false,
  },
};

const builder = new addonBuilder(manifest);

// ── helpers ──────────────────────────────────────────────────────────────────

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString('en-GB', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
}

function isLive(match) {
  const now = Date.now();
  const start = match.date;
  const twoHoursMs = 2 * 60 * 60 * 1000;
  return start <= now && start >= now - twoHoursMs;
}

function matchToMeta(match) {
  const live = isLive(match);
  const dateStr = formatDate(match.date);
  const status = live ? '🔴 LIVE' : (match.date > Date.now() ? '🕐 Upcoming' : '⏱ Recent');

  return {
    id: `football:${match.id}`,
    type: 'tv',
    name: match.title,
    poster: match.poster
      ? `${BASE_URL}${match.poster}`
      : (match.teams?.home?.badge
          ? `${BASE_URL}${match.teams.home.badge}`
          : null),
    background: match.teams?.home?.badge
      ? `${BASE_URL}${match.teams.home.badge}`
      : null,
    logo: match.teams?.home?.badge
      ? `${BASE_URL}${match.teams.home.badge}`
      : null,
    description: `${status} · ${dateStr}\n\n${match.teams?.home?.name || ''} vs ${match.teams?.away?.name || ''}`,
    genres: [live ? 'Live' : 'Upcoming', 'Football'],
    releaseInfo: dateStr,
    behaviorHints: { defaultVideoId: `football:${match.id}` },
  };
}

async function fetchMatches(endpoint) {
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      headers: { 'User-Agent': 'Stremio Football Addon/1.0' },
      timeout: 10000,
    });
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error('Fetch error:', e.message);
    return [];
  }
}

async function fetchStreams(source, id) {
  try {
    const res = await fetch(`${BASE_URL}/api/stream/${source}/${id}`, {
      headers: { 'User-Agent': 'Stremio Football Addon/1.0' },
      timeout: 10000,
    });
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error('Stream fetch error:', e.message);
    return [];
  }
}

// ── catalog ──────────────────────────────────────────────────────────────────

builder.defineCatalogHandler(async ({ type, id, extra }) => {
  if (type !== 'tv') return { metas: [] };

  let matches = [];

  if (id === 'football-live') {
    matches = await fetchMatches('/api/matches/live');
    // Filter to football only
    matches = matches.filter(m => m.category === 'football');
  } else if (id === 'football-all') {
    matches = await fetchMatches('/api/matches/football');
  }

  // Sort: live first, then upcoming by date
  const now = Date.now();
  matches.sort((a, b) => {
    const aLive = isLive(a);
    const bLive = isLive(b);
    if (aLive && !bLive) return -1;
    if (!aLive && bLive) return 1;
    return a.date - b.date;
  });

  const skip = parseInt(extra?.skip || 0);
  const PAGE_SIZE = 50;
  const page = matches.slice(skip, skip + PAGE_SIZE);

  return { metas: page.map(matchToMeta) };
});

// ── meta ─────────────────────────────────────────────────────────────────────

builder.defineMetaHandler(async ({ type, id }) => {
  if (type !== 'tv' || !id.startsWith('football:')) return { meta: null };

  const matchId = id.replace('football:', '');
  const matches = await fetchMatches('/api/matches/football');
  const match = matches.find(m => m.id === matchId);

  if (!match) return { meta: null };
  return { meta: matchToMeta(match) };
});

// ── streams ──────────────────────────────────────────────────────────────────

builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== 'tv' || !id.startsWith('football:')) return { streams: [] };

  const matchId = id.replace('football:', '');

  // Find the match to get its sources
  const matches = await fetchMatches('/api/matches/football');
  const match = matches.find(m => m.id === matchId);

  if (!match || !match.sources?.length) return { streams: [] };

  // Fetch streams for all sources in parallel
  const streamResults = await Promise.allSettled(
    match.sources.map(src => fetchStreams(src.source, src.id))
  );

  const streams = [];
  streamResults.forEach((result, i) => {
    if (result.status !== 'fulfilled') return;
    const srcStreams = result.value;
    const srcName = match.sources[i].source;

    if (Array.isArray(srcStreams)) {
      srcStreams.forEach(s => {
        if (!s.embedUrl) return;
        const quality = s.hd ? '🔵 HD' : '⚪ SD';
        const lang = s.language ? ` · ${s.language}` : '';
        streams.push({
          name: `${quality}${lang}`,
          title: `${match.title}\n${quality} · Source: ${srcName}${lang}`,
          url: s.embedUrl,
          behaviorHints: {
            notWebReady: false,
          },
        });
      });
    }
  });

  return { streams };
});

// ── serve ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 7000;

serveHTTP(builder.getInterface(), { port: PORT });

console.log(`\n⚽ Football Live Streams Addon running!`);
console.log(`\n📡 Add to Stremio:`);
console.log(`   http://127.0.0.1:${PORT}/manifest.json\n`);
