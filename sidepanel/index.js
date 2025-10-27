/* global Summarizer */
import DOMPurify from 'dompurify';
import { marked } from 'marked';

const MAX_MODEL_CHARS = 4000;

let pageContent = '';

const summaryElement = document.querySelector('#summary');
const warningElement = document.querySelector('#warning');
const summaryTypeSelect = document.querySelector('#type');
const summaryFormatSelect = document.querySelector('#format');
const summaryLengthSelect = document.querySelector('#length');
const summarizeButton = document.querySelector('#summarizeButton');

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

// Split long text into chunks
function chunkText(text, maxLength = MAX_MODEL_CHARS) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + maxLength));
    start += maxLength;
  }
  return chunks;
}

// Main summarization function
async function generateSummary(text) {
  try {
    const options = {
      sharedContext: 'this is a website',
      type: summaryTypeSelect.value,
      format: summaryFormatSelect.value,
      length: summaryLengthSelect.value
    };

    const availability = await Summarizer.availability();
    if (availability === 'unavailable') return 'Summarizer API not available';

    // Create a fresh summarizer instance for each run
    const summarizer = await Summarizer.create(options);

    // Show download message if needed
    if (summarizer.downloadProgress) {
      showSummary('Downloading model…');
      await summarizer.downloadProgress;
    }

    // Ensure the model is fully ready
    await summarizer.ready;

    showSummary('Summarizing…');

    // Chunk text and summarize
    const chunks = chunkText(text);
    let finalSummary = '';
    for (const chunk of chunks) {
      const chunkSummary = await summarizer.summarize(chunk);
      finalSummary += chunkSummary + '\n\n';
    }

    summarizer.destroy();
    return finalSummary;

  } catch (e) {
    console.error('Summary generation failed', e);
    return 'Error: ' + e.message;
  }
}

// --- Local AI (using Summarizer API) for Music BPM Analysis ---
async function analyzeMusicGenre(summaryText) {
  try {
    const availability = await Summarizer.availability();
    if (availability === 'unavailable') {
      console.warn('Summarizer API not available for genre analysis.');
      return {
        bpm: 100,
        genres: ['summarizer api unavailable']
      };
    }

    // Create a new summarizer instance, customized for emotion → music mapping
    const summarizer = await Summarizer.create({
      sharedContext: 'You are a music-savvy assistant. Given a text excerpt, identify the tonally matching music genres, and approximate tempo (BPM).',
      type: 'key-points', // short structured output
      format: 'plain-text',
      length: 'short'
    });

    if (summarizer.downloadProgress) {
      console.log('Downloading local summarizer model...');
      await summarizer.downloadProgress;
    }
    await summarizer.ready;

    // Ask it to output structured JSON
    const prompt = `
    Analyze the following text's emotional tone and energy level.
    Respond only with JSON:
    {
    "genres": ["genre1", "genre2"],
    "bpm": 100
    }

    Text:
    """${summaryText}"""
    `;

    const reply = await summarizer.summarize(prompt);

    summarizer.destroy();

    // Attempt to parse JSON output
    let result;
    try {
      result = JSON.parse(reply);
    } catch {
      console.warn('Could not parse JSON from Summarizer reply:', reply);
      result = {
        bpm: 100,
        genres: ['failed to parse summarizer json']
      };
    }

    return result;
  } catch (e) {
    console.error('Music analysis failed:', e);
    return {
      bpm: 100,
      genres: ['genre analysis failed']
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
  showSummary('Preparing summary…');

  const summary = await generateSummary(pageContent);
  showSummary(summary);

  const analysis = await analyzeMusicGenre(summary);

  const musicInfo = `
  ---
  🎵
  **Suggested BPM:** ${analysis.bpm}
  **Genres:** ${analysis.genres.join(', ')}
  `;

  showSummary(`${musicInfo} \n\n  ${summary}`);

});

// Update page content when config changes
function onConfigChange() {
  const oldContent = pageContent;
  pageContent = '';
  onContentChange(oldContent);
}

[summaryTypeSelect, summaryFormatSelect, summaryLengthSelect].forEach((e) =>
  e.addEventListener('change', onConfigChange)
);

// Listen for content from session storage
chrome.storage.session.get('pageContent', ({ pageContent: storedContent }) => {
  if (storedContent) pageContent = storedContent;
});

// Update page content if storage changes
chrome.storage.session.onChanged.addListener((changes) => {
  if (changes['pageContent']) {
    pageContent = changes['pageContent'].newValue;
  }
});

// Handle content changes
async function onContentChange(newContent) {
  if (pageContent === newContent) return;
  pageContent = newContent;

  if (!pageContent) {
    showSummary("There's nothing to summarize");
    updateWarning('');
    return;
  }

  if (pageContent.length > MAX_MODEL_CHARS) {
    updateWarning(
      `Text is very long (${pageContent.length} characters). It will be summarized in chunks.`
    );
  } else {
    updateWarning('');
  }

  showSummary("Click 'Summarize Page' to generate summary.");
}
