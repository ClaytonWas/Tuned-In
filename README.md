# Tuned In is now on the [Chrome Web Store](https://chromewebstore.google.com/detail/tuned-in/jfpnhopfpcgkpfjeifjnoimjehhclcem)

Tuned In is a music recommendation Chrome extension that uses AI and Spotify to analyze webpage content and recommend songs that match the emotionality and energy of the page.

## Why I Built It

I think Spotify has a great music recommendation algorithm and appreciated the opportunity to take advantage of that through the text based content medium. This local, on-device model provides the chance to develop an application that achieves this goal with no online overhead or data collection issues.

## How It Works

The extension uses Chrome's experimental [Summarization API](https://developer.chrome.com/docs/ai/summarizer-api) (powered by Gemini Nano) to analyze webpage content locally on your device. The AI model extracts musical characteristics (genres and tempo) from the content, which are then used to search Spotify's API for matching tracks.

**The Process:**
1. Extract readable content from the current webpage using Mozilla's Readability library
2. Summarize the content using Chrome's on-device Summarization API
3. Analyze the summary to extract musical genres and tempo (BPM)
4. Search Spotify for tracks matching those characteristics
5. Filter results by popularity threshold (with smart fallback)
6. Display the recommended track with album art and links

### Use Cases

- [Fandom.com character bios](https://metalgear.fandom.com/wiki/Solid_Snake)
- [Obscure codices](https://sacred-texts.com/alc/emerald.htm)
- [Wikipedia articles](https://en.wikipedia.org/wiki/Musicology)
- Blog posts and articles
- Any text-heavy webpage

## Features

### 🎵 Smart Music Recommendations
- Analyzes webpage content to extract musical genres and tempo
- Searches Spotify for matching tracks
- Filters by popularity threshold with intelligent fallback (decrements by 10 if no matches found)
- Displays album art, track info, and direct Spotify links

### 📝 Text Processing Options
<img width="349" height="27" alt="image" src="https://github.com/user-attachments/assets/8b073912-8d5f-4482-87e6-ea2eff7aefaa" />

**Full Text vs. Chunk Mode**
- **Chunk Mode** (default): Analyzes the first portion of the page for faster results
- **Full Text Mode**: Processes the entire page in chunks for comprehensive analysis
- Adjustable chunk size (1,000-10,000 characters) for optimal performance

<img width="337" height="76" alt="image" src="https://github.com/user-attachments/assets/7e72d0bb-4c4b-4bc5-b695-4733240138e5" />
<br>
<img width="337" height="61" alt="image" src="https://github.com/user-attachments/assets/e113ed32-fc0a-41de-bec2-a54f167f5259" />


**Smart Warnings**
The extension shows helpful warnings when:
- Text is very long and will be truncated in chunk mode
- Full text mode will require multiple processing chunks

### 📚 Recommendation History
- View all past recommendations with embedded Spotify players
- Each entry includes:
  - Spotify track embed
  - Source page link
  - Track details (name, artist, genres, BPM)
  - Expandable "More Info" section
- Links back to original webpages
- Customizable history limit

 <img width="350" height="700" alt="image" src="https://github.com/user-attachments/assets/2e070679-eaf3-4994-97cb-8c0570435a2a" />


### 🎯 Interactive UI Elements
- **Scrolling Text**: Track names and artist names scroll smoothly on hover
- **Direct Spotify Links**: Click track names or artist names to open in Spotify Web Player
- **Quick Actions**: "Open in Spotify" button for instant access
- **Live Updates**: History count updates dynamically as recommendations are added

## Settings

### Header Controls
Located at the top of the side panel:

- **Full Text Checkbox**: Toggle between chunk mode and full web page text processing
- **Chunk Slider**: Adjust the character limit for each processing chunk (1,000-10,000)

### Settings Panel

<img width="357" height="311" alt="image" src="https://github.com/user-attachments/assets/41495cf7-4338-4e89-ad91-9bd4140f5fe8" />

Access via the ⚙️ Settings button in the footer:

- **Theme**: Choose from 19 color themes
- **History Limit**: Number of recommendations to save (1-100)
- **Popularity Threshold**: Minimum Spotify popularity score (0-100)
  - If no tracks meet the threshold, the extension automatically tries lower thresholds in increments of 10
- **Export History**: Download your recommendation history as a JSON file
- **Clear History**: Remove all saved recommendations (with confirmation)

All settings are automatically saved and persist across sessions.

## Examples

### Wikipedia
<img width="600" height="630" alt="image" src="https://github.com/user-attachments/assets/2a8bc576-969a-422f-b7d6-9387ae8d0126" />

The extension can analyze webpage content and recommend fitting music. For example, analyzing the Wikipedia page for rock music might recommend prominent rock tracks.

### Export Recommendation History
```json
[
  {
    "trackName": "Scared",
    "trackArtist": "The Tragically Hip",
    "artistIds": [
      "0YMeriqrS3zgsX24nfY0F0"
    ],
    "genres": [
      "rock",
      "indie",
      "blues"
    ],
    "bpm": 120,
    "trackId": "7jTns7NXrRxED1h1zObE04",
    "pageUrl": "https://en.wikipedia.org/wiki/Rock_music",
    "pageTitle": "Rock music - Wikipedia"
  }
]
```

### Technical Documentation
When analyzing technical documentation, the extension might recommend calm, focused music suitable for coding or studying.

### Hyperlinks and Navigation
- **Track Links**: Click any track name or artist name to open in Spotify Web Player
- **Source Links**: Each history entry includes a link back to the original webpage
- **Spotify Embeds**: Interactive Spotify players embedded in history items

## Technical Details

### On-device AI Processing
Tuned In uses Chrome's experimental [Summarization API](https://developer.chrome.com/docs/ai/summarizer-api), which runs Gemini Nano locally on your device. This means:
- ✅ No data sent to external servers
- ✅ Complete privacy
- ✅ Works offline (after initial setup)
- ✅ Fast, local processing

### API Integration
The extension requires a [Spotify API endpoint](https://github.com/ClaytonWas/tuned-in-api) to search for tracks. If you want to recreate a similar extension you'll need to:
1. Set up a Spotify Developer account
2. Deploy the provided API endpoint
3. Configure the API URL in the extension

### Smart Popularity Filtering
When searching for tracks:
1. First attempts to find tracks matching the set popularity threshold
2. If no matches, automatically decreases threshold by 10
3. Continues until tracks are found or threshold reaches 0
4. Falls back to all tracks (sorted by popularity) if needed

This ensures you always get a recommendation, even with strict popularity settings.

## Installation & Setup

### Prerequisites
- Chrome browser (>= Stable 138)
- Node.js and npm
- Spotify Developer account
- Origin trial token for Summarization API

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/ClaytonWas/tuned-in.git
   cd tuned-in
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the extension**
   ```bash
   npm run build
   ```

4. **Load in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` directory

5. **Set up Spotify API**
   - Deploy the [Spotify API endpoint](https://github.com/ClaytonWas/tuned-in-api)
   - Configure the API URL in the extension code

6. **Configure Origin Trial Token**
   - Get your [origin trial token](https://developer.chrome.com/docs/web-platform/origin-trials#extensions) for the Writer API
   - Update the `trial_tokens` field in `manifest.json`
   - Remove the `key` field if using your own token

7. **Start using**
   - Click the extension icon to open the side panel
   - Navigate to any webpage
   - Click "Generate Recommendation" to analyze the page

## Privacy & Security

- **100% Local Processing**: All AI analysis happens on your device
- **No Data Collection**: No user data is sent to external servers
- **No Tracking**: The extension doesn't track your browsing
- **Open Source**: Full source code available for review

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

**Note**: The Summarization API is currently experimental and requires an origin trial token. Check [Chrome's documentation](https://developer.chrome.com/docs/ai/summarizer-api) for the latest information on availability and setup.
