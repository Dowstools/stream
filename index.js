const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

const BASE_URL = 'https://streamed.pk';

const manifest = {
  id: 'community.streamed.football',
  version: '1.0.22',
  name: 'Football Live Streams',
  description: 'Live and upcoming football from streamed.pk',
  resources: ['catalog', 'meta', 'stream'],
  types: ['tv'],
  catalogs: [
    {
      type: 'tv',
      id: 'football-all',
      name: 'Football',
      extra: [{ name: 'skip' }],
    },
  ],
};

const builder = new addonBuilder(manifest);

function isLive(match) {
  const now = Date.now();
  return match.date <= now && match.date >= now - 2 * 60 * 60 * 1000;
}

function formatDate(ts) {
  return new Date(ts).toLocaleString('en-GB', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function matchToMeta(match, full = false) {
  const live = isLive(match);
  const prefix = live ? '[LIVE] ' : '';
  const poster = match.poster
    ? `${BASE_URL}${match.poster}`
    : match.teams?.home?.badge
      ? `${BASE_URL}${match.teams.home.badge}`
      : null;

  const meta = {
    id: `football:${match.id}`,
    type: 'tv',
    name: `${prefix}${match.title}`,
    poster,
    behaviorHints: { defaultVideoId: `football:${match.id}` },
  };

  if (full) {
    meta.description = `${live ? '🔴 LIVE' : formatDate(match.date)}\n${match.teams?.home?.name || ''} vs ${match.teams?.away?.name || ''}`;
    meta.background = poster;
    meta.logo = poster;
  }

  return meta;
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

// ── catalog ───────────────────────────────────────────────────────────────────

builder.defineCatalogHandler(async ({ type, id, extra }) => {
  if (type !== 'tv' || id !== 'football-all') return { metas: [] };

  let matches = await apiFetch('/api/matches/football');

  // Sort: live first, then soonest upcoming
  matches.sort((a, b) => {
    const al = isLive(a), bl = isLive(b);
    if (al && !bl) return -1;
    if (!al && bl) return 1;
    return a.date - b.date;
  });

  const skip = parseInt(extra?.skip || 0);
  const page = matches.slice(skip, skip + 15); // keep response small

  return { metas: page.map(m => matchToMeta(m, false)) };
});

// ── meta ──────────────────────────────────────────────────────────────────────

builder.defineMetaHandler(async ({ type, id }) => {
  if (type !== 'tv' || !id.startsWith('football:')) return { meta: null };
  const matchId = id.replace('football:', '');
  const matches = await apiFetch('/api/matches/football');
  const match = matches.find(m => m.id === matchId);
  if (!match) return { meta: null };
  return { meta: matchToMeta(match, true) };
});

// ── streams ───────────────────────────────────────────────────────────────────

builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== 'tv' || !id.startsWith('football:')) return { streams: [] };
  const matchId = id.replace('football:', '');

  const matches = await apiFetch('/api/matches/football');
  const match = matches.find(m => m.id === matchId);
  if (!match?.sources?.length) return { streams: [] };

  const results = await Promise.allSettled(
    match.sources.map(src =>
      apiFetch(`/api/stream/${src.source}/${src.id}`)
    )
  );

  const streams = [];
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !Array.isArray(r.value)) return;
    r.value.forEach(s => {
      if (!s.embedUrl) return;
      streams.push({
        name: `${s.hd ? 'HD' : 'SD'}${s.language ? ' · ' + s.language : ''}`,
        title: `${match.sources[i].source} · ${s.hd ? 'HD' : 'SD'}`,
        url: s.embedUrl,
      });
    });
  });

  return { streams };
});

// ── start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`Football addon running on port ${PORT}`);
