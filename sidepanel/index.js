/* global Summarizer */
import DOMPurify from 'dompurify';
import { marked } from 'marked';

let MAX_MODEL_CHARS = 10000;

let pageContent = '';

let summaryHistory = JSON.parse(localStorage.getItem('summaryHistory') || '[]');

const summaryElement = document.querySelector('#summary');
const warningElement = document.querySelector('#warning');
const summarizeButton = document.querySelector('#summarizeButton');

const CLIENT_ID = 'd63591e407ff436e8e79bfa1dcc8df18';
const CLIENT_SECRET = '5bc18bec7d5e4ed29f267fc9ad462c44';

// Cache the token
let cachedToken = null;
let tokenExpiry = null;

// Show warning
function updateWarning(warning) {
  warningElement.textContent = warning;
  if (warning) {
    warningElement.removeAttribute('hidden');
  } else {
    warningElement.setAttribute('hidden', '');
  }
}

// Show summary safely
function showSummary(text) {
  summaryElement.innerHTML = DOMPurify.sanitize(marked.parse(text));
}

function renderHistory() {
  const historyList = document.querySelector('#historyList');
  historyList.innerHTML = '';

  summaryHistory.forEach(item => {
    const li = document.createElement('li');
    li.classList.add('history-item');

    // Spotify embed link
    const spotifyEmbedUrl = `https://open.spotify.com/embed/track/${item.trackId}`;

    li.innerHTML = `
      <div style="margin-bottom: 0.5rem;">
        <a href="${item.pageUrl}" target="_blank">${item.pageTitle}</a>
      </div>
      <div>
        <iframe 
          src="${spotifyEmbedUrl}" 
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
          loading="lazy"
          frameBorder="0"
          style="border-radius:12px">
        </iframe>
      </div>
      <details style="margin-top: 0.5rem;">
        <summary style="cursor: pointer;">More Info</summary>
        <div><strong>Track:</strong> ${item.trackName}</div>
        <div><strong>Artist:</strong> ${item.trackArtist}</div>
        <div><strong>Suggested Genres:</strong> ${item.genres.join(', ')}</div>
        <div><strong>Suggested BPM:</strong> ${item.bpm}</div>
      </details>
    `;

    historyList.appendChild(li);
  });
}

// Get Spotify access token
async function getSpotifyToken() {
  // Return cached token if still valid
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    console.log('Using cached Spotify token');
    return cachedToken;
  }

  try {
    console.log('Fetching new Spotify token via Client Credentials...');
    
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Token fetch error:', res.status, text);
      throw new Error(`Failed to get token: ${res.status}`);
    }

    const data = await res.json();
    console.log('Token received, expires in:', data.expires_in, 'seconds');
    
    // Cache the token
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
    
    return cachedToken;
  } catch (e) {
    console.error('Error getting Spotify token:', e);
    throw e;
  }
}

// Search for tracks on Spotify
async function searchSpotifyTracks(genres, bpm) {
  try {
    const token = await getSpotifyToken();
    
    // Build search query based on genres
    const searchTerms = genres.join(' ');
    const query = new URLSearchParams({
      q: searchTerms,
      type: 'track',
      limit: '10'
    });

    console.log('Searching Spotify for:', searchTerms);

    const res = await fetch(`https://api.spotify.com/v1/search?${query}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Spotify Search error:', res.status, text);
      return null;
    }

    const data = await res.json();
    const tracks = data.tracks?.items || [];
    
    if (tracks.length === 0) {
      console.warn('No tracks found for:', searchTerms);
      return null;
    }

    console.log(`Found ${tracks.length} tracks`);

    // Get audio features to find tracks close to target BPM
    const trackIds = tracks.map(t => t.id).slice(0, 10).join(',');
    const featuresRes = await fetch(`https://api.spotify.com/v1/audio-features?ids=${trackIds}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!featuresRes.ok) {
      console.warn('Could not fetch audio features, returning random track');
      const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
      return randomTrack;
    }

    const featuresData = await featuresRes.json();
    const tracksWithFeatures = tracks.map((track, i) => ({
      ...track,
      tempo: featuresData.audio_features[i]?.tempo || 0,
    }));

    // Find track closest to target BPM
    const bestMatch = tracksWithFeatures.reduce((best, current) => {
      const bestDiff = Math.abs(best.tempo - bpm);
      const currentDiff = Math.abs(current.tempo - bpm);
      return currentDiff < bestDiff ? current : best;
    });

    console.log(`Best match: "${bestMatch.name}" by ${bestMatch.artists[0].name} (BPM: ${Math.round(bestMatch.tempo)})`);
    return bestMatch;

  } catch (e) {
    console.error('Error searching Spotify:', e);
    return null;
  }
}

// Chunk text for full text processing
function chunkText(text, chunkSize) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

// Main summarization function
async function generateSummary(text, fullTextMode) {
  let summarizer;
  try {
    const options = {
      sharedContext: 'This is a website.',
      type: 'key-points',
      format: 'plain-text',
      length: 'short',
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          console.log(`Downloaded ${e.loaded * 100}%`);
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
      
      if (fullTextMode && text.length > MAX_MODEL_CHARS) {
        // Process in chunks and combine
        const chunks = chunkText(text, MAX_MODEL_CHARS);
        console.log(`Processing ${chunks.length} chunks in full text mode`);
        
        const summaries = [];
        for (let i = 0; i < chunks.length; i++) {
          showSummary(`Processing chunk ${i + 1} of ${chunks.length}...`);
          const chunkSummary = await summarizer.summarize(chunks[i]);
          summaries.push(chunkSummary);
        }
        
        // Combine all chunk summaries
        const combinedSummary = summaries.join('\n\n');
        
        // If combined summary is still too long, summarize it again
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

// Analyze music genre and BPM from summary
async function analyzeMusicGenre(summaryText) {
  let summarizer;
  try {
    const options = {
      sharedContext: 'You are a music analyst. Analyze text and suggest matching music characteristics.',
      type: 'key-points',
      format: 'plain-text',
      length: 'short',
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          console.log(`Downloaded ${e.loaded * 100}%`);
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

      const prompt = `Analyze this text and suggest matching music characteristics. Output ONLY in this exact format:

genres: ["genre1", "genre2", "genre3"]
bpm: number

Rules:
- Use 2-3 valid Spotify genres (lowercase, no spaces)
- BPM range: 60-180 based on the content's pace and energy (slow=60-90, medium=90-120, fast=120-180)

Text to analyze:
"""${summaryText}"""`;

      const reply = await summarizer.summarize(prompt);
      console.log('Music analysis reply:\n', reply);
      summarizer.destroy();

      // Parse the response
      let genres = [];
      let bpm = 100;

      try {
        const clean = reply.replace(/\*/g, '').trim();

        // Extract genres array
        const genresMatch = clean.match(/genres:\s*\[([^\]]+)\]/i);
        if (genresMatch) {
          const genresStr = genresMatch[1];
          genres = genresStr
            .split(',')
            .map(g => g.trim().replace(/['"]/g, '').toLowerCase())
            .filter(g => g.length > 0);
        }

        // Extract BPM
        const bpmMatch = clean.match(/bpm:\s*(\d+)/i);
        if (bpmMatch) {
          bpm = parseInt(bpmMatch[1], 10);
          bpm = Math.max(60, Math.min(180, bpm));
        }

      } catch (e) {
        console.error('Error parsing music analysis:', e);
      }

      // Validate and set defaults
      if (!Array.isArray(genres) || genres.length === 0) {
        genres = ['ambient', 'electronic'];
      }

      // Remove duplicates and limit to 3
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

// Color theme handling
const colorThemeSelect = document.querySelector('#colorTheme');
const savedTheme = localStorage.getItem('colorTheme') || 'blue';
colorThemeSelect.value = savedTheme;
applyColorTheme(savedTheme);

colorThemeSelect.addEventListener('change', (e) => {
  const theme = e.target.value;
  localStorage.setItem('colorTheme', theme);
  applyColorTheme(theme);
});

function applyColorTheme(theme) {
  const root = document.documentElement;
  
  // Get the current CSS and update color references
  const styleSheets = document.styleSheets;
  const historyItems = document.querySelectorAll('.history-item');
  const musicInfo = document.querySelector('#musicInfo');
  const summarizeButton = document.querySelector('#summarizeButton');
  
  historyItems.forEach(item => {
    updateElementTheme(item, theme);
  });
  
  if (musicInfo) {
    updateElementTheme(musicInfo, theme);
  }

  if (summarizeButton) {
    updateElementTheme(summarizeButton, theme);
  }
}

function updateElementTheme(element, theme) {
  // Update border colors
  element.style.borderColor = `var(--${theme}-9)`;
  element.style.backgroundColor = `var(--${theme}-11)`;
  
  // Update nested elements
  const details = element.querySelector('details');
  const summary = element.querySelector('summary');
  if (details) details.style.backgroundColor = `var(--${theme}-9)`;
  if (summary) summary.style.backgroundColor = `var(--${theme}-9)`;
  
  // Update links
  const links = element.querySelectorAll('a');
  links.forEach(link => {
    link.style.color = `var(--${theme}-2)`;
  });
}

// Character limit handling
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

// Full text mode handling
const fullTextCheckbox = document.querySelector('#fullTextMode');
const savedFullText = localStorage.getItem('fullTextMode') === 'true';
fullTextCheckbox.checked = savedFullText;

fullTextCheckbox.addEventListener('change', (e) => {
  localStorage.setItem('fullTextMode', e.checked);
  onContentChange();
});

// Button click handler
summarizeButton.addEventListener('click', async () => {
  if (!pageContent) {
    updateWarning("There's nothing to summarize");
    return;
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

  // Show analysis data
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
  
  // Apply current theme to musicInfo
  updateElementTheme(musicInfo, colorThemeSelect.value);
  musicInfo.removeAttribute('hidden');

  showSummary('*Searching for a matching track...*');

  try {
    const track = await searchSpotifyTracks(analysis.genres, analysis.bpm);

    if (track) {
      // Fill UI fields
      trackName.textContent = track.name;
      trackArtist.textContent = track.artists.map(a => a.name).join(', ');
      spotifyLink.href = track.external_urls.spotify;
      
      if (track.album?.images?.[0]?.url) {
        albumCover.src = track.album.images[0].url;
        albumCover.removeAttribute('hidden');
      }

      trackInfo.removeAttribute('hidden');
    } else {
      spotifySearchLink.innerHTML = `<a href="https://open.spotify.com/search/${encodeURIComponent(analysis.genres.join(' '))}" target="_blank">Search manually on Spotify</a>`;
    }
        
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      const pageUrl = activeTab.url;
      const pageTitle = activeTab.title;

      // Add to history
      summaryHistory.unshift({
        trackName: track.name,
        trackArtist: track.artists.map(a => a.name).join(', '),
        genres: analysis.genres,
        bpm: analysis.bpm,
        trackId: track.id, 
        pageUrl,
        pageTitle
      });

      // Keep only last 20 entries
      summaryHistory = summaryHistory.slice(0, 20);
      localStorage.setItem('summaryHistory', JSON.stringify(summaryHistory));
      renderHistory();
      
      // Apply theme to newly rendered history items
      const historyItems = document.querySelectorAll('.history-item');
      historyItems.forEach(item => {
        updateElementTheme(item, colorThemeSelect.value);
      });
    });

    showSummary("");
    console.log('Track fetched successfully');
  } catch (e) {
    console.error('Error fetching track:', e);
    spotifySearchLink.textContent = `Error fetching track: ${e.message}`;
    showSummary("Error fetching track");
  }
});

// Listen for content from session storage
chrome.storage.session.get('pageContent', ({ pageContent: storedContent }) => {
  if (storedContent) {
    pageContent = storedContent;
    onContentChange();
  }
});

// Update page content if storage changes
chrome.storage.session.onChanged.addListener((changes) => {
  if (changes['pageContent']) {
    pageContent = changes['pageContent'].newValue;
    onContentChange();
  }
});

// Handle content changes
function onContentChange() {
  if (!pageContent) {
    showSummary("There's nothing to summarize");
    updateWarning('');
    return;
  }

  // Check dynamically based on current checkbox state
  const fullTextMode = fullTextCheckbox.checked;
  
  if (pageContent.length > MAX_MODEL_CHARS) {
    if (fullTextMode) {
      const chunks = Math.ceil(pageContent.length / MAX_MODEL_CHARS);
      updateWarning(
        `Full text mode enabled. Text will be processed in ${chunks} chunks (${pageContent.length.toLocaleString()} characters total). This will take longer.`
      );
    } else {
      updateWarning(
        `Text is very long (${pageContent.length.toLocaleString()} characters). Only the first ${MAX_MODEL_CHARS.toLocaleString()} characters will be analyzed. Enable "Full Text" to process the entire page (takes longer).`
      );
    }
  } else {
    updateWarning('');
  }

  showSummary("Click 'Summarize Page' to generate summary and music recommendations.");
}

// Initialize on load
renderHistory();
// Apply theme to history items on load
const historyItems = document.querySelectorAll('.history-item');
historyItems.forEach(item => {
  updateElementTheme(item, colorThemeSelect.value);
});
onContentChange();