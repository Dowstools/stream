const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

const BASE_URL = 'https://streamed.pk';

const manifest = {
  id: 'community.streamed.football.v2',
  version: '2.0.0',
  name: 'Football Today',
  description: "Today's live football streams",
  resources: ['catalog', 'stream'],
  types: ['tv'],
  catalogs: [
    {
      type: 'tv',
      id: 'football-today',
      name: 'Football Today',
    },
  ],
};

const builder = new addonBuilder(manifest);

function isToday(ts) {
  const d = new Date(ts);
  const now = new Date();
  return d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
}

function isLive(ts) {
  const now = Date.now();
  return ts <= now && ts >= now - 2 * 60 * 60 * 1000;
}

async function apiFetch(path) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'User-Agent': 'Stremio/1.0' },
      timeout: 10000,
    });
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
}

builder.defineCatalogHandler(async ({ type, id }) => {
  if (type !== 'tv' || id !== 'football-today') return { metas: [] };

  const matches = await apiFetch('/api/matches/football');

  const today = matches
    .filter(m => isToday(m.date))
    .sort((a, b) => {
      // live first, then by time
      const al = isLive(a.date), bl = isLive(b.date);
      if (al && !bl) return -1;
      if (!al && bl) return 1;
      return a.date - b.date;
    });

  const metas = today.map(m => ({
    id: `football:${m.id}`,
    type: 'tv',
    name: (isLive(m.date) ? '[LIVE] ' : '') + m.title,
    poster: m.poster
      ? `${BASE_URL}${m.poster}`
      : m.teams?.home?.badge
        ? `${BASE_URL}${m.teams.home.badge}`
        : null,
    behaviorHints: { defaultVideoId: `football:${m.id}` },
  }));

  return { metas };
});

builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== 'tv' || !id.startsWith('football:')) return { streams: [] };

  const matchId = id.replace('football:', '');
  const matches = await apiFetch('/api/matches/football');
  const match = matches.find(m => m.id === matchId);
  if (!match?.sources?.length) return { streams: [] };

  // Only use first 2 sources to keep it minimal
  const sources = match.sources.slice(0, 2);
  const results = await Promise.allSettled(
    sources.map(src => apiFetch(`/api/stream/${src.source}/${src.id}`))
  );

  const streams = [];
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !Array.isArray(r.value)) return;
    const best = r.value.find(s => s.hd) || r.value[0];
    if (best?.embedUrl) {
      streams.push({
        name: best.hd ? 'HD' : 'SD',
        title: sources[i].source,
        url: best.embedUrl,
      });
    }
  });

  return { streams };
});

const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`Running on port ${PORT}`);
