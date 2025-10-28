/* global Summarizer */
import DOMPurify from 'dompurify';
import { marked } from 'marked';

const MAX_MODEL_CHARS = 10000;

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
  let summarizer;  // Declare summarizer outside of the if block
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
      // The Summarizer API isn't usable.
      return;
    }

    // Check for user activation before creating the summarizer
    if (navigator.userActivation.isActive) {
      summarizer = await Summarizer.create(options);
    }

    if (summarizer) { // Ensure summarizer is defined
      // Ensure the model is ready
      await summarizer.ready;

      showSummary('Summarizing…');

      // Summarize the full text at once
      text = text.slice(0, MAX_MODEL_CHARS); // Trim to max length
      const finalSummary = await summarizer.summarize(text);

      summarizer.destroy();
      return finalSummary;
    } else {
      throw new Error('Summarizer could not be created.');
    }

  } catch (e) {
    console.error('Summary generation failed', e);
    return 'Error: ' + e.message;
  }
}

async function analyzeMusicGenre(summaryText) {
  let summarizer;  // Declare summarizer outside the if block
  try {
    const options = {
      sharedContext: 'You are a music-savvy assistant. Given a text excerpt, identify the tonally matching music genres and BPM.',
      type: 'key-points',
      format: 'plain-text',
      length: 'short',
      language: 'en', // Specify the output language as English (you can change this if needed)
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          console.log(`Downloaded ${e.loaded * 100}%`);
        });
      }
    };

    const availability = await Summarizer.availability();
    console.log('Summarizer availability:', availability);
    if (availability === 'unavailable') {
      console.warn('Summarizer API not available for genre analysis.');
      return {
        bpm: 100,
        genres: ['summarizer api unavailable']
      };
    }

    // Check for user activation before creating the summarizer
    if (navigator.userActivation.isActive) {
      try {
        summarizer = await Summarizer.create(options);
        console.log('Summarizer created successfully:', summarizer);
      } catch (error) {
        console.error('Error creating summarizer:', error);
        throw new Error('Summarizer could not be created.');
      }
    } else {
      // For testing, you can bypass the activation check if you want to see if it works without user activation
      console.warn('User activation not active, proceeding with summarizer creation...');
      summarizer = await Summarizer.create(options);
    }

    if (summarizer) {
      // Ensure the model is ready
      await summarizer.ready;

      // Ask it to output structured JSON
      const prompt = `
      Analyze the following text's emotional tone and energy level. 
      I am going to first provide you with an output template I want, then I will provide the text to analyze.

      Include no sentence summaries. I want this content summarized but you are you output the analysis strictly in the following format. Do not devaite from this format under any circumstances.

      Output Format:
        genres: ["", "", ""]
        bpm: number

      Text:
      """${summaryText}"""
      `;


      const reply = await summarizer.summarize(prompt);

      summarizer.destroy();

      // Attempt to parse JSON output
      // let result;
      // try {
      //   result = JSON.parse(reply);
      // } catch {
      //   console.warn('Could not parse JSON from Summarizer reply:', reply);
      //   result = {
      //     bpm: 100,
      //     genres: ['failed to parse summarizer json']
      //   };
      // }

      return reply;
    } else {
      throw new Error('Summarizer could not be created.');
    }
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

  let musicInfo;

  if (analysis.genres && analysis.bpm) {
    musicInfo = `
      ---
      🎵
      **Suggested BPM:** ${analysis.bpm};
      **Genres:** ${analysis.genres.join(', ')};
      `;
  } else {
    musicInfo = analysis;
  }

  showSummary(`${musicInfo}`);
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
