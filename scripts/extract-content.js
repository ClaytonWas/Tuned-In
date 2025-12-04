// Content script: Extracts meaningful visible text from the current webpage
(function() {
  function getFilteredVisibleText() {
    let text = '';
    try {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function(node) {
          if (!node.parentElement) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          const tag = parent.tagName.toLowerCase();
          // Exclude hidden elements
          const style = window.getComputedStyle(parent);
          if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return NodeFilter.FILTER_REJECT;
          // Exclude ARIA landmarks and dialogs
          const role = parent.getAttribute('role');
          if (role && /dialog|banner|navigation|complementary|alert|search|form|contentinfo|region|main|menu|menubar|tooltip|status|tablist|tabpanel|presentation/i.test(role)) return NodeFilter.FILTER_REJECT;
          if (["script","style","nav","footer","header","aside"].includes(tag)) return NodeFilter.FILTER_REJECT;
          // Exclude cookie/privacy/policy banners by class/id
          const classId = (parent.className + ' ' + parent.id).toLowerCase();
          if (/cookie|privacy|policy|terms|settings|help|contact|login|register|basket|cart|ad|advert|consent|banner|modal|popup|alert|notice|preferences/i.test(classId)) return NodeFilter.FILTER_REJECT;
          // Exclude short, repetitive, or boilerplate text
          const txt = node.textContent.trim();
          if (txt.length < 3) return NodeFilter.FILTER_REJECT;
          if (/^(ok|accept|close|yes|no|save|cancel)$/i.test(txt)) return NodeFilter.FILTER_REJECT;
          if (/cookie|privacy|policy|terms|settings|help|contact|login|register|basket|cart|ad|advert|consent|preferences/i.test(txt)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      let node;
      const uniqueLines = new Set();
      while ((node = walker.nextNode())) {
        const line = node.textContent.trim();
        if (line.length > 2 && !uniqueLines.has(line)) {
          uniqueLines.add(line);
        }
      }
      text = Array.from(uniqueLines).join('\n');
    } catch (e) {
      text = 'Unable to extract visible text.';
    }
    return text.trim();
  }

  // Listen for messages from the extension
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request && request.type === 'EXTRACT_VISIBLE_TEXT') {
      sendResponse({ text: getFilteredVisibleText() });
    }
  });
})();
import { isProbablyReaderable, Readability } from '@mozilla/readability';

function canBeParsed(document) {
  return isProbablyReaderable(document, {
    minContentLength: 100
  });
}

function parse(document) {
  if (!canBeParsed(document)) {
    return false;
  }
  const documentClone = document.cloneNode(true);
  const article = new Readability(documentClone).parse();
  return article.textContent;
}

parse(window.document);
