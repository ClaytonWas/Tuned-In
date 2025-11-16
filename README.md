Check it out in the [Chrome Web Store](https://chromewebstore.google.com/detail/tuned-in/jfpnhopfpcgkpfjeifjnoimjehhclcem)

---

# Tuned In

Tuned In is a music recommendation Chrome extension that uses Chrome's on-device AI model (Gemini Nano) and Spotify to analyze webpage content and recommend songs that match the emotionality and energy of the page.

## Why I Built It

I think Spotify has a great music recommendation algorithm and appreciated the opportunity to take advantage of that through different content mediums. This local, on-device model provides the chance to develop an application that achieves this goal with no online overhead or data collection issues—everything runs locally on your device.

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
- [Exotic olive oil websites](https://groveandvine.com/our-process/)
- Wikipedia articles
- Blog posts and articles
- Any text-heavy webpage

## Features

### 🎵 Smart Music Recommendations
- Analyzes webpage content to extract musical genres and tempo
- Searches Spotify for matching tracks
- Filters by popularity threshold with intelligent fallback (decrements by 10 if no matches found)
- Displays album art, track info, and direct Spotify links

### 🎨 Customizable Themes
Choose from 19 beautiful color themes including:
- Gray (default)
- Indigo
- Jungle

All themes feature a sleek, modern design with smooth transitions.

### ⚙️ Comprehensive Settings Panel
Access all settings through a convenient slide-up panel:

- **Theme Selector**: Choose from 19 color themes
- **History Limit**: Set how many recent recommendations to save (1-100)
- **Popularity Threshold**: Filter Spotify tracks by minimum popularity (0-100)
- **Export History**: Download your recommendation history as JSON
- **Clear History**: Remove all saved recommendations

### 📝 Text Processing Options

**Full Text vs. Chunk Mode**
- **Chunk Mode** (default): Analyzes the first portion of the page for faster results
- **Full Text Mode**: Processes the entire page in chunks for comprehensive analysis
- Adjustable chunk size (1,000-10,000 characters) for optimal performance

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

### 🎯 Interactive UI Elements
- **Scrolling Text**: Track names and artist names scroll smoothly on hover (even if they fit)
- **Direct Spotify Links**: Click track names or artist names to open in Spotify Web Player
- **Quick Actions**: "Open in Spotify" button for instant access
- **Live Updates**: History count updates dynamically as recommendations are added

## Settings

### Header Controls
Located at the top of the side panel:

- **Full Text Checkbox**: Toggle between chunk mode and full text processing
- **Chunk Slider**: Adjust the character limit for each processing chunk (1,000-10,000)

### Settings Panel
Access via the ⚙️ Settings button in the footer:

- **Theme**: Choose from 19 color themes
- **History Limit**: Number of recommendations to save (1-100)
- **Popularity Threshold**: Minimum Spotify popularity score (0-100)
  - If no tracks meet the threshold, the extension automatically tries lower thresholds in increments of 10
- **Export History**: Download your recommendation history as a JSON file
- **Clear History**: Remove all saved recommendations (with confirmation)

All settings are automatically saved and persist across sessions.

## Examples

### Character Bio Analysis
The extension can analyze character descriptions and recommend fitting music. For example, analyzing a Bulbasaur page might recommend Pokémon-themed tracks.

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
The extension requires a [Spotify API endpoint](https://github.com/ClaytonWas/tuned-in-api) to search for tracks. You'll need to:
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
- Chrome browser (latest version)
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

## License

[Add your license here]

---

**Note**: The Summarization API is currently experimental and requires an origin trial token. Check [Chrome's documentation](https://developer.chrome.com/docs/ai/summarizer-api) for the latest information on availability and setup.
