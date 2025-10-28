/* global Summarizer */
import DOMPurify from 'dompurify';
import { marked } from 'marked';

const MAX_MODEL_CHARS = 10000;

let pageContent = '';

const summaryElement = document.querySelector('#summary');
const warningElement = document.querySelector('#warning');
const summarizeButton = document.querySelector('#summarizeButton');

const CLIENT_ID = 'd63591e407ff436e8e79bfa1dcc8df18';
const CLIENT_SECRET = '7ed4be94682d4dbba308a65c839c4b1d';

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
      energy: featuresData.audio_features[i]?.energy || 0.5
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

// Main summarization function
async function generateSummary(text) {
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
      text = text.slice(0, MAX_MODEL_CHARS);
      const finalSummary = await summarizer.summarize(text);
      summarizer.destroy();
      return finalSummary;
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
- Use 2-3 valid Spotify genres (lowercase, no spaces): ambient, acoustic, alternative, blues, classical, country, dance, electronic, folk, hip-hop, indie, jazz, pop, r-n-b, rock, soul
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

// Button click handler
summarizeButton.addEventListener('click', async () => {
  if (!pageContent) {
    updateWarning("There's nothing to summarize");
    return;
  }

  updateWarning('');
  showSummary('Preparing summary...');

  const summary = await generateSummary(pageContent);
  
  if (summary.startsWith('Error:')) {
    showSummary(summary);
    return;
  }
  
  showSummary(summary);

  // Analyze music characteristics
  showSummary(summary + '\n\n---\n\n*Analyzing musical characteristics...*');
  
  const analysis = await analyzeMusicGenre(summary);

  // Build the music info section
  let musicInfo = `\n\n---\n\n## 🎵 Music Recommendation\n\n`;
  
  musicInfo += `**Suggested BPM:** ${analysis.bpm}\n\n`;
  musicInfo += `**Genres:** ${analysis.genres.join(', ')}\n\n`;

  showSummary(summary + musicInfo + '\n*Searching for a matching track...*');

  // Search for a track
  try {
    const track = await searchSpotifyTracks(analysis.genres, analysis.bpm);
    
    if (track) {
      musicInfo += `---\n\n### 🎧 Suggested Track\n\n`;
      musicInfo += `**${track.name}**\n\n`;
      musicInfo += `by ${track.artists.map(a => a.name).join(', ')}\n\n`;
      if (track.tempo) {
        musicInfo += `BPM: ${Math.round(track.tempo)} | Energy: ${(track.energy * 100).toFixed(0)}%\n\n`;
      }
      if (track.album?.images?.[0]?.url) {
        musicInfo += `![Album Cover](${track.album.images[0].url})\n\n`;
      }
      musicInfo += `[▶️ Listen on Spotify](${track.external_urls.spotify})\n\n`;
    } else {
      musicInfo += `---\n\n`;
      musicInfo += `*Could not find a matching track. [Search manually on Spotify](https://open.spotify.com/search/${encodeURIComponent(analysis.genres.join(' '))})*\n\n`;
    }
  } catch (e) {
    console.error('Error fetching track:', e);
    musicInfo += `---\n\n*Error fetching track: ${e.message}*\n\n`;
  }
  
  // Add Spotify search link
  const searchQuery = encodeURIComponent(analysis.genres.join(' '));
  musicInfo += `---\n\n[🔍 Explore more on Spotify](https://open.spotify.com/search/${searchQuery})`;

  showSummary(summary + musicInfo);
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

  if (pageContent.length > MAX_MODEL_CHARS) {
    updateWarning(
      `Text is very long (${pageContent.length} characters). Only the first ${MAX_MODEL_CHARS} characters will be analyzed.`
    );
  } else {
    updateWarning('');
  }

  showSummary("Click 'Summarize Page' to generate summary and music recommendations.");
}

// Initialize on load
onContentChange();