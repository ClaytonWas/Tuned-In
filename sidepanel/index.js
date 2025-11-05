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

  if (summaryHistory.length === 0) {
    historyList.innerHTML = '<li style="text-align: center; padding: 1rem;">No history yet</li>';
    return;
  }

  historyList.innerHTML = '';

  for (let i = 0; i < summaryHistory.length; i++) {
    const item = summaryHistory[i];
    const li = document.createElement('li');
    li.classList.add('history-item');

    const spotifyEmbedUrl = `https://open.spotify.com/embed/track/${item.trackId}`;

    li.innerHTML = `
      <div>
        <iframe 
          src="${spotifyEmbedUrl}" 
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
          loading="lazy"
          frameBorder="0"
          style="border-radius:12px; width: 100%; height: 80px; border: none;">
        </iframe>
      </div>

      <div style="margin-bottom: 0.5rem;">
        <p>Source:</p>
        <strong><a href="${item.pageUrl}" target="_blank">${item.pageTitle}</a></strong>
      </div>

      <details style="margin-top: 0.5rem;">
        <summary style="cursor: pointer;">More Info</summary>

        <div style="display: flex; justify-content: space-between;">Track:
          <span>
            <a href="https://open.spotify.com/track/${item.trackId}" target="_blank">
              ${item.trackName}
            </a>
          </span>
        </div>

        <div style="display: flex; justify-content: space-between;">Artist:
          <span>
            ${item.artistIds
              .map((id, index) =>
                `<a href="https://open.spotify.com/artist/${id}" target="_blank">${item.trackArtist.split(', ')[index]}</a>`
              ).join(', ')
            }
          </span>
        </div>

        <div style="display: flex; justify-content: space-between;">Suggested Genres:
          <span>${item.genres.join(', ')}</span>
        </div>

        <div style="display: flex; justify-content: space-between;">Suggested BPM:
          <span>${item.bpm}</span>
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

    const popularTracks = tracks
      .filter(t => t.popularity > 25)
      .sort((a, b) => b.popularity - a.popularity);

    const randomIndex = Math.floor(Math.random() * Math.min(20, popularTracks.length));
    const selectedTrack = popularTracks[randomIndex] || tracks[0];

    console.log(`Selected track: "${selectedTrack.name}" by ${selectedTrack.artists[0].name} (popularity: ${selectedTrack.popularity})`);
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

    if (navigator.userActivation.isActive) {
      summarizer = await Summarizer.create(options);
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

    if (navigator.userActivation.isActive) {
      summarizer = await Summarizer.create(options);
    } else {
      summarizer = await Summarizer.create(options);
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

// Apply selected color theme across UI elements
const colorThemeSelect = document.querySelector('#colorTheme');
const savedTheme = localStorage.getItem('colorTheme') || 'gray';
colorThemeSelect.value = savedTheme;
applyColorTheme(savedTheme);

colorThemeSelect.addEventListener('change', (e) => {
  const theme = e.target.value;
  localStorage.setItem('colorTheme', theme);
  applyColorTheme(theme);
});

// Apply theme styles to multiple UI components
function applyColorTheme(theme) {
  const toolbar = document.querySelector('.toolbar');
  const summary = document.querySelector('#summary');
  const warning = document.querySelector('#warning');
  const historyItems = document.querySelectorAll('.history-item');
  const musicInfo = document.querySelector('#musicInfo');
  const summarizeButton = document.querySelector('#summarizeButton');

  document.body.style.backgroundColor = `var(--${theme}-11)`

  if (toolbar) {
    toolbar.style.color = `var(--${theme}-3)`;
  }

  if (summarizeButton) {
    updateElementTheme(summarizeButton, theme);
  }

  if (musicInfo) {
    updateElementTheme(musicInfo, theme);
  }

  if (summary) {
    summary.style.backgroundColor = `var(--${theme}-10)`;
    summary.style.borderColor = `var(--${theme}-12)`;
    summary.style.color = 'rgb(231, 231, 231)';
  }

  if (warning) {
    warning.style.backgroundColor = `var(--${theme}-10)`;
    warning.style.borderColor = `var(--${theme}-12)`;
    warning.style.color = 'rgb(231, 231, 231)';
  }

  historyItems.forEach(item => {
    updateElementTheme(item, theme);
  });
}

// Apply theme to a single element (history card, button, etc.)
function updateElementTheme(element, theme) {
  const isHistoryItem = element.classList.contains('history-item');

  element.style.borderColor = `var(--${theme}-12)`;

  if (isHistoryItem) {
    element.style.backgroundColor = `var(--${theme}-10)`;
    element.style.borderColor = `var(--${theme}-12)`;
  } else {
    element.style.backgroundColor = `var(--${theme}-8)`;
    element.style.borderColor = `var(--${theme}-10)`;
  }

  const details = element.querySelector('details');
  const summary = element.querySelector('summary');
  if (details) details.style.backgroundColor = `var(--${theme}-10)`;
  if (summary) summary.style.backgroundColor = `var(--${theme}-10)`;

  const links = element.querySelectorAll('a');
  links.forEach(link => {
    if (isHistoryItem) {
      link.style.color = `var(--${theme}-5)`;
    } else {
      link.style.color = `var(--${theme}-1)`;
    }
  });
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
  spotifySearchLink.textContent = '';

  updateElementTheme(musicInfo, colorThemeSelect.value);
  musicInfo.removeAttribute('hidden');

  showSummary('Searching for a matching track...');

  try {
    const track = await getRecommendedTrack(analysis.genres, analysis.bpm);
    isAnalyzing = false;

    if (track) {
      trackName.textContent = track.name;
      trackArtist.textContent = track.artists.map(a => a.name).join(', ');
      spotifyLink.href = track.external_urls.spotify;

      if (track.album?.images?.[0]?.url) {
        albumCover.src = track.album.images[0].url;
        albumCover.removeAttribute('hidden');
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

      summaryHistory = summaryHistory.slice(0, 20);
      localStorage.setItem('summaryHistory', JSON.stringify(summaryHistory));
      renderHistory();

      summaryElement.setAttribute('hidden', '');
    } else {
      spotifySearchLink.innerHTML = `<a href="https://open.spotify.com/search/${encodeURIComponent(analysis.genres.join(' '))}" target="_blank">Search manually on Spotify</a>`;
      summaryElement.removeAttribute('hidden');
      showSummary("Could not find a matching track");
    }

  } catch (e) {
    isAnalyzing = false;
    console.error('Error fetching track:', e);
    spotifySearchLink.textContent = `Error fetching track: ${e.message}`;
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
  }
});