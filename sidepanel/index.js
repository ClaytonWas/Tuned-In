/* global Summarizer */
import DOMPurify from 'dompurify';
import { marked } from 'marked';

// DEBUG FLAG
const DEBUG = true;
if (!DEBUG) {
  console.log = function () {};
  console.warn = function () {};
  console.error = function(){};
}

let MAX_MODEL_CHARS = 10000;

let pageContent = '';
let isAnalyzing = false;
let summaryHistory = JSON.parse(localStorage.getItem('summaryHistory') || '[]');
let maxHistoryLimit = parseInt(localStorage.getItem('historyLimit') || '20', 10);
let popularityThreshold = parseInt(localStorage.getItem('popularityThreshold') || '25', 10);

const summaryElement = document.querySelector('#summary');
const warningElement = document.querySelector('#warning');
const summarizeButton = document.querySelector('#summarizeButton');

// Cache the Spotify token
let cachedToken = null;
let tokenExpiry = null;

// Update the warning area in the UI
function updateWarning(warning) {
  warningElement.textContent = warning;
  if (warning) {
    warningElement.removeAttribute('hidden');
  } else {
    warningElement.setAttribute('hidden', '');
  }
}

// Render the summary with HTML sanitization
function showSummary(text) {
  summaryElement.innerHTML = DOMPurify.sanitize(marked.parse(text));
}

// Show temporary skeleton placeholders for history UI
function showSkeletonHistory() {
  const historyList = document.querySelector('#historyList');
  historyList.innerHTML = `
    <li class="history-item">
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton skeleton-embed"></div>
    </li>
    <li class="history-item">
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton skeleton-embed"></div>
    </li>
  `;
}

// Render full history progressively for smoother UI
async function renderHistory() {
  const historyList = document.querySelector('#historyList');
  const historyCount = document.querySelector('#historyCount');

  if (summaryHistory.length === 0) {
    historyList.innerHTML = '<li class="empty-state">No recommendations yet. Generate your first one above!</li>';
    if (historyCount) historyCount.textContent = '0';
    return;
  }

  if (historyCount) historyCount.textContent = summaryHistory.length.toString();

  historyList.innerHTML = '';

  for (let i = 0; i < summaryHistory.length; i++) {
    const item = summaryHistory[i];
    const li = document.createElement('li');
    li.classList.add('history-item');

    const spotifyEmbedUrl = `https://open.spotify.com/embed/track/${item.trackId}`;

    li.innerHTML = `
      <iframe 
        src="${spotifyEmbedUrl}" 
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
        loading="lazy"
        frameBorder="0">
      </iframe>

      <div class="source-link">
        <span style="font-size: 0.75rem; color: rgba(231, 231, 231, 0.6);">Source:</span>
        <strong><a href="${item.pageUrl}" target="_blank">${item.pageTitle}</a></strong>
      </div>

      <details>
        <summary>More Info</summary>
        <div class="details-content">
          <div class="details-row">
            <span class="details-label">Track:</span>
            <span>
              <a href="https://open.spotify.com/track/${item.trackId}" target="_blank">
                ${item.trackName}
              </a>
            </span>
          </div>

          <div class="details-row">
            <span class="details-label">Artist:</span>
            <span>
              ${item.artistIds
                .map((id, index) =>
                  `<a href="https://open.spotify.com/artist/${id}" target="_blank">${item.trackArtist.split(', ')[index]}</a>`
                ).join(', ')
              }
            </span>
          </div>

          <div class="details-row">
            <span class="details-label">Genres:</span>
            <span>${item.genres.join(', ')}</span>
          </div>

          <div class="details-row">
            <span class="details-label">BPM:</span>
            <span>${item.bpm}</span>
          </div>
        </div>
      </details>
    `;

    historyList.appendChild(li);
    updateElementTheme(li, colorThemeSelect.value);

    if (i < summaryHistory.length - 1 && i % 3 === 2) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
}

// Fetch Spotify token from your backend & cache it
async function getSpotifyToken() {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    console.log('Using cached Spotify token');
    return cachedToken;
  }

  try {
    console.log('Fetching new Spotify token from serverless function...');
    const res = await fetch('https://tuned-in-api.vercel.app/api/spotify-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Token fetch error:', res.status, text);
      throw new Error(`Failed to get token: ${res.status}`);
    }

    const data = await res.json();
    console.log('Token received from serverless function');

    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;

    return cachedToken;
  } catch (e) {
    console.error('Error getting Spotify token:', e);
    throw e;
  }
}

// Spotify search query using genres + BPM mood
function buildSmartSearchQuery(genres, bpm) {
  const genreKeywords = {
    'pop': ['pop', 'catchy', 'upbeat'],
    'rock': ['rock', 'guitar', 'alternative'],
    'hip-hop': ['hip hop', 'rap', 'beats'],
    'electronic': ['electronic', 'synth', 'edm'],
    'indie': ['indie', 'alternative', 'folk'],
    'jazz': ['jazz', 'smooth', 'instrumental'],
    'classical': ['classical', 'piano', 'orchestra'],
    'ambient': ['ambient', 'chill', 'atmospheric'],
    'metal': ['metal', 'heavy', 'hard rock'],
    'folk': ['folk', 'acoustic', 'singer-songwriter'],
    'r-n-b': ['r&b', 'soul', 'smooth'],
    'country': ['country', 'americana', 'folk'],
    'reggae': ['reggae', 'ska', 'dub'],
    'blues': ['blues', 'soul', 'rhythm'],
    'soul': ['soul', 'motown', 'r&b'],
    'punk': ['punk', 'rock', 'alternative'],
    'disco': ['disco', 'funk', 'dance'],
    'house': ['house', 'electronic', 'dance'],
    'techno': ['techno', 'electronic', 'edm'],
    'trance': ['trance', 'electronic', 'progressive'],
    'dubstep': ['dubstep', 'bass', 'electronic']
  };

  let moodTerms = [];
  if (bpm < 80) {
    moodTerms = ['slow', 'melancholic', 'sad', 'ballad', 'emotional'];
  } else if (bpm < 100) {
    moodTerms = ['chill', 'relaxing', 'mellow', 'downtempo', 'laid-back'];
  } else if (bpm < 120) {
    moodTerms = ['moderate', 'groovy', 'smooth', 'steady'];
  } else if (bpm < 140) {
    moodTerms = ['upbeat', 'energetic', 'driving', 'lively'];
  } else {
    moodTerms = ['fast', 'intense', 'aggressive', 'high-energy', 'powerful'];
  }

  const queryParts = [];

  for (const genre of genres.slice(0, 2)) {
    const keywords = genreKeywords[genre.toLowerCase()] || [genre];
    queryParts.push(keywords[0]);
  }

  const moodTerm = moodTerms[Math.floor(Math.random() * moodTerms.length)];
  queryParts.push(moodTerm);

  return queryParts.join(' ');
}

// Search for tracks using the smart query builder
async function searchSpotifyTracks(genres, bpm) {
  try {
    const token = await getSpotifyToken();

    const searchQuery = buildSmartSearchQuery(genres, bpm);

    console.log(`Searching Spotify with query: "${searchQuery}"`);

    const searchParams = new URLSearchParams({
      q: searchQuery,
      type: 'track',
      limit: '50'
    });

    const searchRes = await fetch(`https://api.spotify.com/v1/search?${searchParams}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!searchRes.ok) {
      const text = await searchRes.text();
      console.error('Spotify search error:', searchRes.status, text);
      return null;
    }

    const searchData = await searchRes.json();
    const tracks = searchData.tracks?.items || [];

    if (tracks.length === 0) {
      console.warn('No tracks found from search.');
      return null;
    }

    console.log(`Found ${tracks.length} tracks`);

    // Filter tracks by popularity threshold, decreasing by 10 if no matches
    let currentThreshold = popularityThreshold;
    let filteredTracks = tracks.filter(t => t.popularity >= currentThreshold);
    
    // If no tracks meet threshold, try decreasing by increments of 10
    while (filteredTracks.length === 0 && currentThreshold > 0) {
      currentThreshold = Math.max(0, currentThreshold - 10);
      filteredTracks = tracks.filter(t => t.popularity >= currentThreshold);
      console.log(`No tracks found with popularity >= ${currentThreshold + 10}, trying ${currentThreshold}`);
    }
    
    // If still no tracks, use all tracks but sorted by popularity
    if (filteredTracks.length === 0) {
      console.log(`No tracks found with any popularity threshold, using all tracks`);
      filteredTracks = tracks;
    }
    
    const popularTracks = filteredTracks
      .sort((a, b) => b.popularity - a.popularity);

    const randomIndex = Math.floor(Math.random() * Math.min(20, popularTracks.length));
    const selectedTrack = popularTracks[randomIndex];

    if (!selectedTrack) {
      console.warn('No track selected');
      return null;
    }

    console.log(`Selected track: "${selectedTrack.name}" by ${selectedTrack.artists[0].name} (popularity: ${selectedTrack.popularity}, threshold used: ${currentThreshold})`);
    return selectedTrack;

  } catch (e) {
    console.error('Error searching Spotify:', e);
    return null;
  }
}

// Search using genre-themed playlists as a fallback
async function searchFromGenrePlaylists(genres, bpm) {
  try {
    const token = await getSpotifyToken();

    const playlistQuery = `${genres[0]} ${bpm < 100 ? 'chill' : 'energetic'}`;

    console.log(`Searching playlists with query: "${playlistQuery}"`);

    const searchParams = new URLSearchParams({
      q: playlistQuery,
      type: 'playlist',
      limit: '10'
    });

    const playlistRes = await fetch(`https://api.spotify.com/v1/search?${searchParams}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!playlistRes.ok) return null;

    const playlistData = await playlistRes.json();
    const playlists = playlistData.playlists?.items || [];

    if (playlists.length === 0) return null;

    const randomPlaylist = playlists[Math.floor(Math.random() * playlists.length)];

    console.log(`Getting tracks from playlist: "${randomPlaylist.name}"`);

    const tracksRes = await fetch(`https://api.spotify.com/v1/playlists/${randomPlaylist.id}/tracks?limit=50`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!tracksRes.ok) return null;

    const tracksData = await tracksRes.json();
    const tracks = tracksData.items
      .filter(item => item.track && item.track.id)
      .map(item => item.track);

    if (tracks.length === 0) return null;

    const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];

    console.log(`Found track from playlist "${randomPlaylist.name}": "${randomTrack.name}"`);
    return randomTrack;

  } catch (e) {
    console.error('Error searching playlists:', e);
    return null;
  }
}

// Decide recommendation using 3 strategies: search → playlist → fallback
async function getRecommendedTrack(genres, bpm) {
  let track = await searchSpotifyTracks(genres, bpm);
  if (track) {
    return track;
  }

  console.log('Trying playlist-based search...');
  track = await searchFromGenrePlaylists(genres, bpm);

  if (track) {
    return track;
  }

  console.log('Falling back to simple search...');
  const fallbackQuery = genres.join(' ');

  const token = await getSpotifyToken();
  const searchParams = new URLSearchParams({
    q: fallbackQuery,
    type: 'track',
    limit: '20'
  });

  const searchRes = await fetch(`https://api.spotify.com/v1/search?${searchParams}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!searchRes.ok) {
    return null;
  }

  const searchData = await searchRes.json();
  const tracks = searchData.tracks?.items || [];

  if (tracks.length === 0) {
    return null;
  }

  return tracks[Math.floor(Math.random() * tracks.length)];
}

// Split long text into chunks for multi-pass summarizing
function chunkText(text, chunkSize) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

// Generate a summary using on-device Summarizer (supports chunked mode)
async function generateSummary(text, fullTextMode) {
  let summarizer;
  try {
    let isDownloading = false;
    let lastProgress = -1;
    const options = {
      robustnessLevel: "medium",
      sharedContext: 'This is a website.',
      type: 'key-points',
      expectedInputLanguages: ["en", "ja", "es"],
      outputLanguage: "en",
      format: 'plain-text',
      length: 'short',
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          const percent = Math.round(e.loaded * 100);
          console.log(`Summarizer Downloaded ${percent}%`);
          if (percent > 0 && percent < 100 && percent !== lastProgress) {
            isDownloading = true;
            showSummary(`📥 Downloading Webpage Summarization AI model... ${percent}%\n\n*This only happens on first use or after updates. Please wait.*`);
          }
          lastProgress = percent;
        });
      }
    };

    const availability = await Summarizer.availability();
    if (availability === 'unavailable') {
      return 'Error: Summarizer API is not available';
    }

    // Try to create summarizer - user activation may not be available for auto-generate
    try {
      summarizer = await Summarizer.create(options);
    } catch (e) {
      if (e.message && e.message.includes('user activation')) {
        return 'Error: User interaction required. Please click the button to generate recommendations.';
      }
      throw e;
    }

    if (summarizer) {
      await summarizer.ready;

      if (isDownloading) {
        showSummary('Download complete! Summarizing content...');
      } else {
        showSummary('Summarizing content...');
      }

      if (fullTextMode && text.length > MAX_MODEL_CHARS) {
        const chunks = chunkText(text, MAX_MODEL_CHARS);
        console.log(`Processing ${chunks.length} chunks in full text mode`);

        const summaries = [];
        for (let i = 0; i < chunks.length; i++) {
          showSummary(`Processing chunk ${i + 1} of ${chunks.length}...`);
          const chunkSummary = await summarizer.summarize(chunks[i]);
          summaries.push(chunkSummary);
        }

        const combinedSummary = summaries.join('\n\n');

        if (combinedSummary.length > MAX_MODEL_CHARS) {
          showSummary('Creating final summary...');
          const finalSummary = await summarizer.summarize(combinedSummary.slice(0, MAX_MODEL_CHARS));
          summarizer.destroy();
          return finalSummary;
        }

        summarizer.destroy();
        return combinedSummary;
      } else {
        text = text.slice(0, MAX_MODEL_CHARS);
        const finalSummary = await summarizer.summarize(text);
        summarizer.destroy();
        return finalSummary;
      }
    } else {
      throw new Error('Summarizer could not be created. Click the button to activate.');
    }

  } catch (e) {
    console.error('Summary generation failed', e);
    return 'Error: ' + e.message;
  }
}

// Analyze the summary text to extract genres + BPM recommendation
async function analyzeMusicGenre(summaryText) {
  let summarizer;
  try {
    let isDownloading = false;
    let lastProgress = -1;
    const options = {
      robustnessLevel: "medium",
      sharedContext: 'You are a music analyst. Analyze text and suggest matching MUSIC characteristics.',
      type: 'key-points',
      expectedInputLanguages: ["en", "ja", "es"],
      outputLanguage: "en",
      format: 'plain-text',
      length: 'short',
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          const percent = Math.round(e.loaded * 100);
          console.log(`Music Analyzer Downloaded ${percent}%`);
          if (percent > 0 && percent < 100 && percent !== lastProgress) {
            isDownloading = true;
            showSummary(`📥 Downloading Music Analysis AI model... ${percent}%\n\n*This only happens on first use or after updates. Please wait.*`);
          }
          lastProgress = percent;
        });
      }
    };

    const availability = await Summarizer.availability();
    if (availability === 'unavailable') {
      console.warn('Summarizer API not available for genre analysis.');
      return {
        bpm: 100,
        genres: ['ambient', 'electronic']
      };
    }

    // Try to create summarizer - user activation may not be available
    try {
      summarizer = await Summarizer.create(options);
    } catch (e) {
      if (e.message && e.message.includes('user activation')) {
        console.warn('User activation required for analysis');
        return {
          bpm: 100,
          genres: ['ambient', 'electronic']
        };
      }
      console.error('Failed to create summarizer for analysis:', e);
      return {
        bpm: 100,
        genres: ['ambient', 'electronic']
      };
    }

    if (summarizer) {
      await summarizer.ready;

      if (isDownloading) {
        showSummary('Download complete! Analyzing musical characteristics...');
      } else {
        showSummary('*Analyzing musical characteristics...*');
      }

      const prompt = `Analyze this text and suggest MUSIC GENRES and tempo that would match its mood and energy.

IMPORTANT: Use ONLY real music genres like:
- Moods: ambient, chill, sad, happy, party, romantic, aggressive
- Styles: pop, rock, indie, electronic, hip-hop, jazz, classical, folk, country, r-n-b, soul, blues, reggae, metal
- Sub-genres: lo-fi, synthwave, trap, techno, house, disco, punk, grunge

DO NOT use content genres like "thriller", "drama", "documentary", "historical".

Output ONLY in this exact format:
genres: ["genre1", "genre2", "genre3"]
bpm: number

Rules:
- Use 2-3 MUSIC genres that match the content's mood/energy
- BPM: 60-90 (slow/sad), 90-120 (medium/neutral), 120-180 (fast/energetic)
- Genres must be lowercase, no spaces (use hyphens: "hip-hop", "r-n-b")

Text to analyze:
"""${summaryText}"""`;

      const reply = await summarizer.summarize(prompt);
      console.log('Music analysis reply:\n', reply);
      summarizer.destroy();

      let genres = [];
      let bpm = 100;

      try {
        const clean = reply.replace(/\*/g, '').trim();

        const genresMatch = clean.match(/genres:\s*\[([^\]]+)\]/i);
        if (genresMatch) {
          const genresStr = genresMatch[1];
          genres = genresStr
            .split(',')
            .map(g => g.trim().replace(/['"]/g, '').toLowerCase())
            .filter(g => g.length > 0);
        }

        const bpmMatch = clean.match(/bpm:\s*(\d+)/i);
        if (bpmMatch) {
          bpm = parseInt(bpmMatch[1], 10);
          bpm = Math.max(60, Math.min(180, bpm));
        }

      } catch (e) {
        console.error('Error parsing music analysis:', e);
      }

      if (!Array.isArray(genres) || genres.length === 0) {
        genres = ['ambient', 'electronic'];
      }

      genres = [...new Set(genres)].slice(0, 3);

      const result = { genres, bpm };
      console.log('Parsed music analysis:', result);
      return result;

    } else {
      throw new Error('Summarizer could not be created.');
    }
  } catch (e) {
    console.error('Music analysis failed:', e);
    return {
      bpm: 100,
      genres: ['ambient', 'electronic']
    };
  }
}

// Settings panel toggle
const settingsButton = document.querySelector('#settingsButton');
const settingsPanel = document.querySelector('#settingsPanel');
const closeSettings = document.querySelector('#closeSettings');

if (settingsButton && settingsPanel) {
  settingsButton.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsPanel.removeAttribute('hidden');
  });
}

if (closeSettings && settingsPanel) {
  closeSettings.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsPanel.setAttribute('hidden', '');
  });
}

// Close settings when clicking outside
document.addEventListener('click', (e) => {
  if (settingsPanel && !settingsPanel.hasAttribute('hidden') && 
      !settingsPanel.contains(e.target) && 
      !settingsButton?.contains(e.target)) {
    settingsPanel.setAttribute('hidden', '');
  }
});

// Apply selected color theme across UI elements
const colorThemeSelect = document.querySelector('#colorTheme');
const savedTheme = localStorage.getItem('colorTheme') || 'gray';
if (colorThemeSelect) {
  colorThemeSelect.value = savedTheme;
  applyColorTheme(savedTheme);

  colorThemeSelect.addEventListener('change', (e) => {
    const theme = e.target.value;
    localStorage.setItem('colorTheme', theme);
    applyColorTheme(theme);
  });
}

// Apply theme styles using CSS variables
function applyColorTheme(theme) {
  const root = document.documentElement;
  
  // Map theme colors to HSL values
  const themeColors = {
    gray: { bg: '0 0% 3.9%', fg: '0 0% 98%', muted: '0 0% 14.9%', border: '0 0% 14.9%', card: '0 0% 3.9%', link: '0 0% 100%' },
    green: { bg: '142 76% 4%', fg: '142 76% 98%', muted: '142 20% 15%', border: '142 20% 15%', card: '142 76% 4%', link: '142 76% 100%' },
    red: { bg: '0 72% 4%', fg: '0 72% 98%', muted: '0 20% 15%', border: '0 20% 15%', card: '0 72% 4%', link: '0 72% 100%' },
    blue: { bg: '217 91% 4%', fg: '217 91% 98%', muted: '217 20% 15%', border: '217 20% 15%', card: '217 91% 4%', link: '217 91% 100%' },
    violet: { bg: '262 83% 4%', fg: '262 83% 98%', muted: '262 20% 15%', border: '262 20% 15%', card: '262 83% 4%', link: '262 83% 100%' },
    pink: { bg: '330 81% 4%', fg: '330 81% 98%', muted: '330 20% 15%', border: '330 20% 15%', card: '330 81% 4%', link: '330 81% 100%' },
    purple: { bg: '280 100% 4%', fg: '280 100% 98%', muted: '280 20% 15%', border: '280 20% 15%', card: '280 100% 4%', link: '280 100% 100%' },
    indigo: { bg: '239 84% 4%', fg: '239 84% 98%', muted: '239 20% 15%', border: '239 20% 15%', card: '239 84% 4%', link: '239 84% 100%' },
    cyan: { bg: '188 94% 4%', fg: '188 94% 98%', muted: '188 20% 15%', border: '188 20% 15%', card: '188 94% 4%', link: '188 94% 100%' },
    teal: { bg: '173 80% 4%', fg: '173 80% 98%', muted: '173 20% 15%', border: '173 20% 15%', card: '173 80% 4%', link: '173 80% 100%' },
    lime: { bg: '75 85% 4%', fg: '75 85% 98%', muted: '75 20% 15%', border: '75 20% 15%', card: '75 85% 4%', link: '75 85% 100%' },
    yellow: { bg: '53 96% 4%', fg: '53 96% 98%', muted: '53 20% 15%', border: '53 20% 15%', card: '53 96% 4%', link: '53 96% 100%' },
    orange: { bg: '25 95% 4%', fg: '25 95% 98%', muted: '25 20% 15%', border: '25 20% 15%', card: '25 95% 4%', link: '25 95% 100%' },
    choco: { bg: '25 35% 4%', fg: '25 35% 98%', muted: '25 20% 15%', border: '25 20% 15%', card: '25 35% 4%', link: '25 35% 100%' },
    brown: { bg: '30 25% 4%', fg: '30 25% 98%', muted: '30 20% 15%', border: '30 20% 15%', card: '30 25% 4%', link: '30 25% 100%' },
    stone: { bg: '24 10% 4%', fg: '24 10% 98%', muted: '24 10% 15%', border: '24 10% 15%', card: '24 10% 4%', link: '24 10% 100%' },
    sand: { bg: '43 13% 4%', fg: '43 13% 98%', muted: '43 13% 15%', border: '43 13% 15%', card: '43 13% 4%', link: '43 13% 100%' },
    camo: { bg: '90 30% 4%', fg: '90 30% 98%', muted: '90 20% 15%', border: '90 20% 15%', card: '90 30% 4%', link: '90 30% 100%' },
    jungle: { bg: '142 50% 4%', fg: '142 50% 98%', muted: '142 20% 15%', border: '142 20% 15%', card: '142 50% 4%', link: '142 50% 100%' }
  };

  const colors = themeColors[theme] || themeColors.gray;
  
  root.style.setProperty('--bg', `hsl(${colors.bg})`);
  root.style.setProperty('--fg', `hsl(${colors.fg})`);
  root.style.setProperty('--muted', `hsl(${colors.muted})`);
  root.style.setProperty('--border', `hsl(${colors.border})`);
  root.style.setProperty('--card', `hsl(${colors.card})`);
  root.style.setProperty('--link-color', `hsl(${colors.link})`);
}

// Apply theme to a single element (for history items that need dynamic updates)
function updateElementTheme(element, theme) {
  // Theme is now applied globally via CSS variables, but we can still update specific elements if needed
  applyColorTheme(theme);
}

// Set character limit UI and sync with localStorage
const charLimitInput = document.querySelector('#charLimit');
const charLimitValue = document.querySelector('#charLimitValue');
const savedCharLimit = localStorage.getItem('charLimit') || '10000';
charLimitInput.value = savedCharLimit;
charLimitValue.textContent = savedCharLimit;
MAX_MODEL_CHARS = parseInt(savedCharLimit, 10);

charLimitInput.addEventListener('input', (e) => {
  const value = e.target.value;
  charLimitValue.textContent = value;
  MAX_MODEL_CHARS = parseInt(value, 10);
  localStorage.setItem('charLimit', value);
  onContentChange();
});

// Full text mode switch handling
const fullTextCheckbox = document.querySelector('#fullTextMode');
const savedFullText = localStorage.getItem('fullTextMode') === 'true';
fullTextCheckbox.checked = savedFullText;

fullTextCheckbox.addEventListener('change', (e) => {
  localStorage.setItem('fullTextMode', e.target.checked);
  onContentChange();
});

// Initialize all settings
const historyLimitInput = document.querySelector('#historyLimit');
const popularityThresholdInput = document.querySelector('#popularityThreshold');
const exportHistoryBtn = document.querySelector('#exportHistory');
const clearHistoryBtn = document.querySelector('#clearHistory');

// History Limit
if (historyLimitInput) {
  historyLimitInput.value = maxHistoryLimit;
  historyLimitInput.addEventListener('change', (e) => {
    let value = parseInt(e.target.value, 10);
    if (value < 1) {
      value = 1;
      historyLimitInput.value = 1;
    } else if (value > 100) {
      value = 100;
      historyLimitInput.value = 100;
    }
    maxHistoryLimit = value;
    localStorage.setItem('historyLimit', value.toString());
    
    // Trim history if it exceeds new limit
    if (summaryHistory.length > maxHistoryLimit) {
      summaryHistory = summaryHistory.slice(0, maxHistoryLimit);
      localStorage.setItem('summaryHistory', JSON.stringify(summaryHistory));
      renderHistory();
    }
  });
}

// Popularity Threshold
if (popularityThresholdInput) {
  popularityThresholdInput.value = popularityThreshold;
  popularityThresholdInput.addEventListener('input', (e) => {
    let value = parseInt(e.target.value, 10);
    if (isNaN(value)) {
      value = 25;
      popularityThresholdInput.value = 25;
    } else if (value < 0) {
      value = 0;
      popularityThresholdInput.value = 0;
    } else if (value > 100) {
      value = 100;
      popularityThresholdInput.value = 100;
    }
    popularityThreshold = value;
    localStorage.setItem('popularityThreshold', value.toString());
    console.log(`Popularity threshold updated to: ${popularityThreshold}`);
  });
}

// Export History
if (exportHistoryBtn) {
  exportHistoryBtn.addEventListener('click', () => {
    const dataStr = JSON.stringify(summaryHistory, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tuned-in-history-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });
}

// Clear History
if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all history? This cannot be undone.')) {
      summaryHistory = [];
      localStorage.setItem('summaryHistory', JSON.stringify(summaryHistory));
      renderHistory();
    }
  });
}

// Summarize button click → summarize → analyze → recommend
summarizeButton.addEventListener('click', async () => {
  if (!pageContent) {
    updateWarning("");
    return;
  }

  isAnalyzing = true;

  // Track the page title/URL at click time
  let currentPageTitle, currentPageUrl;
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentPageTitle = activeTab.title;
    currentPageUrl = activeTab.url;
  } catch (e) {
    console.error('Error getting page title:', e);
    currentPageTitle = 'Unknown Page';
    currentPageUrl = '#';
  }

  updateWarning('');
  showSummary('Summarizing content...');
  document.querySelector('#musicInfo').setAttribute('hidden', '');

  const fullTextMode = fullTextCheckbox.checked;

  const summary = await generateSummary(pageContent, fullTextMode);

  if (summary.startsWith('Error:')) {
    showSummary(summary);
    return;
  }

  showSummary('*Analyzing musical characteristics...*');
  const analysis = await analyzeMusicGenre(summary);

  const musicInfo = document.querySelector('#musicInfo');
  const bpmElem = document.querySelector('#musicBpm');
  const genresElem = document.querySelector('#musicGenres');
  const trackInfo = document.querySelector('#trackInfo');
  const trackName = document.querySelector('#trackName');
  const trackArtist = document.querySelector('#trackArtist');
  const albumCover = document.querySelector('#albumCover');
  const spotifyLink = document.querySelector('#spotifyLink');
  const spotifySearchLink = document.querySelector('#spotifySearchLink');

  bpmElem.textContent = analysis.bpm;
  genresElem.textContent = analysis.genres.join(', ');
  trackInfo.setAttribute('hidden', '');
  albumCover.src = '';
  if (spotifySearchLink) {
    spotifySearchLink.textContent = '';
    spotifySearchLink.href = '#';
  }

  updateElementTheme(musicInfo, colorThemeSelect.value);
  musicInfo.removeAttribute('hidden');

  showSummary('Searching for a matching track...');

  try {
    const track = await getRecommendedTrack(analysis.genres, analysis.bpm);
    isAnalyzing = false;

    if (track) {
      // Set track name with scrolling
      const trackNameText = track.name;
      trackName.textContent = '';
      const trackNameSpan = document.createElement('span');
      trackNameSpan.textContent = trackNameText;
      trackNameSpan.className = 'track-name-scroll';
      trackName.appendChild(trackNameSpan);
      
      // Calculate scroll distance - always enable scrolling
      setTimeout(() => {
        const nameOverflows = trackNameSpan.scrollWidth > trackName.offsetWidth;
        if (nameOverflows) {
          const overflow = trackNameSpan.scrollWidth - trackName.offsetWidth;
          trackNameSpan.style.setProperty('--scroll-distance', `-${overflow}px`);
        } else {
          // Set a minimal scroll distance so animation always runs
          trackNameSpan.style.setProperty('--scroll-distance', '-10px');
        }
      }, 100);
      
      // Set artist with scrolling
      const artistText = track.artists.map(a => a.name).join(', ');
      trackArtist.textContent = '';
      const artistSpan = document.createElement('span');
      artistSpan.textContent = artistText;
      artistSpan.className = 'track-artist-scroll';
      trackArtist.appendChild(artistSpan);
      
      // Calculate scroll distance - always enable scrolling
      setTimeout(() => {
        const artistOverflows = artistSpan.scrollWidth > trackArtist.offsetWidth;
        if (artistOverflows) {
          const overflow = artistSpan.scrollWidth - trackArtist.offsetWidth;
          artistSpan.style.setProperty('--scroll-distance', `-${overflow}px`);
        } else {
          // Set a minimal scroll distance so animation always runs
          artistSpan.style.setProperty('--scroll-distance', '-10px');
        }
      }, 100);
      
      spotifyLink.href = track.external_urls.spotify;

      if (track.album?.images?.[0]?.url) {
        albumCover.src = track.album.images[0].url;
        albumCover.removeAttribute('hidden');
      }

      if (spotifySearchLink) {
        spotifySearchLink.href = track.external_urls.spotify;
        spotifySearchLink.innerHTML = '<span class="spotify-icon">▶</span><span>Open in Spotify</span>';
      }

      trackInfo.removeAttribute('hidden');

      summaryHistory.unshift({
        trackName: track.name,
        trackArtist: track.artists.map(a => a.name).join(', '),
        artistIds: track.artists.map(a => a.id),
        genres: analysis.genres,
        bpm: analysis.bpm,
        trackId: track.id,
        pageUrl: currentPageUrl,
        pageTitle: currentPageTitle
      });

      // Limit history based on user setting
      if (summaryHistory.length > maxHistoryLimit) {
        summaryHistory = summaryHistory.slice(0, maxHistoryLimit);
        localStorage.setItem('summaryHistory', JSON.stringify(summaryHistory));
      }
      localStorage.setItem('summaryHistory', JSON.stringify(summaryHistory));
      renderHistory();

      summaryElement.setAttribute('hidden', '');
    } else {
      if (spotifySearchLink) {
        spotifySearchLink.href = `https://open.spotify.com/search/${encodeURIComponent(analysis.genres.join(' '))}`;
        spotifySearchLink.innerHTML = '<span class="spotify-icon">🔍</span><span>Search on Spotify</span>';
      }
      summaryElement.removeAttribute('hidden');
      showSummary("Could not find a matching track");
    }

  } catch (e) {
    isAnalyzing = false;
    console.error('Error fetching track:', e);
    const spotifySearchLink = document.querySelector('#spotifySearchLink');
    if (spotifySearchLink) {
      spotifySearchLink.textContent = '';
      spotifySearchLink.href = '#';
    }
    summaryElement.removeAttribute('hidden');
    showSummary("Error fetching track");
  }
});

// Handle whenever content changes (updates warnings + preview)
function onContentChange() {
  if (isAnalyzing) {
    return;
  }

  summaryElement.removeAttribute('hidden');

  if (!pageContent) {
    showSummary("Music Generation Not Currently Possible (There's nothing to summarize)");
    updateWarning('');
    return;
  }

  const fullTextMode = fullTextCheckbox.checked;

  if (pageContent.length > MAX_MODEL_CHARS) {
    if (fullTextMode) {
      const chunks = Math.ceil(pageContent.length / MAX_MODEL_CHARS);
      updateWarning(
        `⚠️ Full text mode enabled. Text will be processed in ${chunks} chunks (${pageContent.length.toLocaleString()} characters total). This will take longer.`
      );
    } else {
      updateWarning(
        `⚠️ Text is very long (${pageContent.length.toLocaleString()} characters). Only the first ${MAX_MODEL_CHARS.toLocaleString()} characters will be analyzed. Enable "Full Text" to process the entire page (takes longer).`
      );
    }
  } else {
    updateWarning('');
  }

  showSummary("Music Generation Possible");
}

// ========== INITIALIZATION ==========

// Show skeleton history immediately
showSkeletonHistory();
showSummary("Loading...");

// Trim history on load if it exceeds the limit
if (summaryHistory.length > maxHistoryLimit) {
  summaryHistory = summaryHistory.slice(0, maxHistoryLimit);
  localStorage.setItem('summaryHistory', JSON.stringify(summaryHistory));
}

// Render actual history asynchronously
setTimeout(() => {
  renderHistory().then(() => {
    console.log('History loaded');
  });
}, 0);

// Load page content from chrome.storage.session after initial load
setTimeout(() => {
  chrome.storage.session.get('pageContent', ({ pageContent: storedContent }) => {
    if (storedContent) {
      pageContent = storedContent;
      onContentChange();
      
      // Note: Auto-generate is disabled because Summarizer API requires user activation
      // The setting is kept for future use or if API changes
      // if (autoGenerate && !isAnalyzing && summarizeButton) {
      //   setTimeout(() => {
      //     summarizeButton.click();
      //   }, 500);
      // }
    } else {
      showSummary("Music Generation Not Currently Possible (There's nothing to summarize)");
    }
  });
}, 0);

// Update page content whenever the active tab sends new data
chrome.storage.session.onChanged.addListener((changes) => {
  if (changes['pageContent']) {
    pageContent = changes['pageContent'].newValue;
    onContentChange();
    
    // Note: Auto-generate is disabled because Summarizer API requires user activation
    // if (autoGenerate && !isAnalyzing && summarizeButton && pageContent) {
    //   setTimeout(() => {
    //     summarizeButton.click();
    //   }, 500);
    // }
  }
});