# Tuned In

Tuned in is a music recommendation software for chrome browsers that uses a local AI model ([Gemini](https://blog.google/technology/ai/google-gemini-ai/)) and Spotify to read the content on your webpage and find songs that match the emotionality and energy of the page.

## Why I Built It

I think Spotify has a great music recommendation algorithm and appreciated the opportunity to take advantage of that through different content mediums. This local model has provided the chance to develop an application that achieves this goal and has no online overhead or data collection issues.

### How It Works

A local AI model handles webpage (and specified page content) summarization to derrive a few songs that aim to represent the emotionality of the content on your webpage. 

Specifically, this extension asks the model for a genre and tempo and calls a [Spotify API](https://github.com/ClaytonWas/tuned-in-api) for a generic list of music. 

### Use Cases

- [Fandom.com character bios](https://metalgear.fandom.com/wiki/Solid_Snake)
- [Obsure codices](https://sacred-texts.com/alc/emerald.htm)
- [Exotic olive oil websites](https://groveandvine.com/our-process/)

### Examples
#### Summarizing a Character Bio
![Image of Music Summarizer getting a Pokemon related track when analyzing the Bulbapedia page for Bulbasaur](https://github.com/user-attachments/assets/1f6fc569-dacc-4477-ac51-a93fa21bce9e)
In this example the extension recommends a track called "_Pokémon_" when analyzing the Bulbapedia page for [Bulbasaur](https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)), this extension has genre validation check which progressivley removes what it has percieved to be music genres in the text until a song is found.

<br>

### Features

#### Settings
Tuned In has 3 togglable settings:

<img width="334" height="36" alt="image" src="https://github.com/user-attachments/assets/2114ca20-a7dd-43a0-baae-f2a73d65f223" />

If you're ever in doubt, hover over them for a tooltip that explains their purposes.

##### Themes
Theme changes are available and use the [propscolor library](https://propscolor.com/).
![colours example](https://github.com/user-attachments/assets/688dcee9-e536-4741-a5fd-9c200c3d46ab)

The **default** colour is gray.

<img width="166" height="423" alt="screenshot_1" src="https://github.com/user-attachments/assets/89c8af29-bca1-4fc6-a2e0-37d990a23adf" />
<img width="173" height="365" alt="screenshot_2" src="https://github.com/user-attachments/assets/be950daf-4601-4ed3-93ae-635071ca024c" />
<img width="50" height="239" alt="image" src="https://github.com/user-attachments/assets/b9a2b668-0398-4825-96b3-d13e791dc97e" />


##### Full Page vs. Text Chunk Summarization
<img width="66" height="20" alt="image" src="https://github.com/user-attachments/assets/64f032e5-b74c-4cc6-92a7-dbb4bef1150a" />
<img width="66" height="20" alt="image" src="https://github.com/user-attachments/assets/e2b1496b-a837-48e0-8e35-7497037e6fa8" />

The local model for the Summarizer API is very reasource demanding. To avoid page summaries taking longer than 15 seconds, the extension gives you the opportunity to summarize only the first chunk of the webpages text content. This is often enough to get a strong recommendation, especially on encyclopedic webpages like Wikipedia or Fandom.

**Quick Summary**

<img width="176" height="127" alt="screenshot_3" src="https://github.com/user-attachments/assets/82882e5b-a647-49f2-8471-d30b6dbf6f96" />

When **Full Text** checkbox is disabled, a prompt will appear indicating how many characters from the start of the webpage will be submited into a single Summarizer API call.

`⚠️ Text is very long (49,659 characters). Only the first 4,000 characters will be analyzed. Enable "Full Text" to process the entire page (takes longer).`

**Full Webpages Text**

<img width="176" height="127" alt="screenshot_4" src="https://github.com/user-attachments/assets/ea07530f-bf2c-4651-8eb9-a0ab212b0750" />

When **Full Text** checkbox is enabled, a prompt will appear indicating how many chunks the text will be split into so that it can be summarized using a local model. 

`⚠️ Full text mode enabled. Text will be processed in 13 chunks (49,659 characters total). This will take longer.`

This can be expediated with a hybrid model, but the current version of this extension doesn't implement that.

##### Size of Text Chunk
<img width="155" height="23" alt="image" src="https://github.com/user-attachments/assets/7cc92e20-773f-4f39-895a-027e02992d1b" />
<img width="160" height="23" alt="image" src="https://github.com/user-attachments/assets/e255252b-3edd-46ac-94ff-dbc040c90c2a" />

The "**Chunk:**" field controls the character amount of the text that is inputed on each Summarizer API call. Chromes documentation recommends keeping this to `4000` or less, but I found an upper limit of `10,000` to work well as well.

#### Hyperlinks to Original Content
<img width="333" height="295" alt="image" src="https://github.com/user-attachments/assets/4eeced42-f222-4d44-abb4-970d6da30406" />

Here the extension recommends listening to a calm track for studying and coding when analyzing the [Chrome developer page for preparing extensions](https://developer.chrome.com/docs/webstore/prepare) to the Chrome store. 

You may have also noticed the,

"**Source:**" 

field in the music history section. 
For each item this contains a link back to the webpage that was scanned to generate this music track.

<img width="323" height="451" alt="image" src="https://github.com/user-attachments/assets/acc7156a-e796-4f94-a1b5-0d1a778b501f" />

The current **Suggested Track**'s song title and artist name is also a hyperlink that takes you to the [Spotify Web Player](https://open.spotify.com/track/6mN97GET1fu6h4NtH5jDuY)'s URL for the track incase you want to quickly share it with friends instead of open in through your Spotify client.

<br>
<br>
<br>

## On-device Summarization with Gemini Nano

[summarizer guide on developer.chrome.com](https://developer.chrome.com/docs/ai/summarizer-api).

It uses Mozilla's [readability](https://github.com/mozilla/readability) library to extract the content of the currently active tab and displays a summary of the page generated by [Chrome's experimental summarization API](https://developer.chrome.com/blog/august2024-summarization-ai) in a side panel.

### Running this extension

1. Clone this repository
2. Run `npm install` in this folder to install all dependencies.
3. Run `npm run build` to build the extension.
4. Load the newly created `dist` directory in Chrome as an [unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).
5. Deploy a [Spotify API](https://github.com/ClaytonWas/tuned-in-api) endpoint with [Spotify for Developers](https://developer.spotify.com/)
6. Click the extension icon to open the summary side panel.
7. Open any web page, the page's content summary will automatically be displayed in the side panel.
8. Update the `"trial_tokens"` field [with your own origin trial token](https://developer.chrome.com/docs/web-platform/origin-trials#extensions) and to remove the `"key"` field in `manifest.json`. The **Summarizer** API is an extension of the **Writer** API, get your trial token from there.
