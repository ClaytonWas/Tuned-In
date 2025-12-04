// Used to track progress animation intervals for each card
const progressAnimators = {};
// Card-based process management for the sidepanel UI
// This file manages process state and rendering for summarization/analysis tasks

let processState = [];
let processIdCounter = 1;

const processContainer = document.createElement('div');
processContainer.id = 'processCardsContainer';
document.querySelector('.main').insertBefore(processContainer, document.getElementById('musicInfo'));

function addProcessCard(type, description) {
  const id = processIdCounter++;
  const process = {
    id,
    type, // 'recommend'
    description,
    progress: 0,
    status: 'running', // 'running', 'done', 'error'
    summary: null,
    analysis: null,
    result: null,
    error: null
  };
  processState.push(process);
  renderProcessCards();
  return id;
}

function updateProcessCard(id, updates) {
  const process = processState.find(p => p.id === id);
  const idx = processState.findIndex(p => p.id === id);
  if (idx === -1) return;
  const prev = processState[idx];
  // Always animate progress smoothly for any progress update
  if (typeof updates.progress === 'number' && updates.progress !== prev.progress) {
    processState[idx] = { ...prev, ...updates };
    const card = document.querySelector(`.process-card[data-id='${id}']`);
    if (card) {
      const fill = card.querySelector('.process-progress-fill');
      if (fill) {
        fill.style.transition = 'width 0.3s cubic-bezier(0.4,0,0.2,1)';
        fill.style.width = `${updates.progress}%`;
      }
    }
  } else {
    processState[idx] = { ...prev, ...updates };
    renderProcessCards();
  }
  }

function startSmoothProgress(id, from, to) {
    // Cancel any previous animator for this card
    if (progressAnimators[id]) {
      clearInterval(progressAnimators[id]);
      delete progressAnimators[id];
    }
    const duration = Math.max(400, Math.min(1200, (to - from) * 20)); // 0.4-1.2s, lightweight
    const steps = 20;
    let step = 0;
    const increment = (to - from) / steps;
    let current = from;
    progressAnimators[id] = setInterval(() => {
      step++;
      current += increment;
      const idx = processState.findIndex(p => p.id === id);
      if (idx !== -1) {
        processState[idx].progress = Math.min(to, Math.max(from, Math.round(current)));
        renderProcessCards();
      }
      if (step >= steps) {
        clearInterval(progressAnimators[id]);
        delete progressAnimators[id];
      }
    }, duration / steps);
}


function removeProcessCard(id) {
  processState = processState.filter(p => p.id !== id);
  renderProcessCards();
}

function renderProcessCards() {
  processContainer.innerHTML = '';
  processState.forEach(process => {
    const card = document.createElement('div');
    card.className = 'process-card';
    card.setAttribute('data-id', process.id);
    card.innerHTML = `
      <div class="process-title">${process.description}</div>
      <div class="process-progress-bar">
        <div class="process-progress-fill" style="width: ${process.progress}%;"></div>
      </div>
      <div class="process-status">${process.status === 'running' ? '⏳ In Progress' : process.status === 'done' ? '✅ Done' : '❌ Error'}</div>
      ${process.summary ? `<div class="process-summary"><strong>Summary:</strong><br>${process.summary}</div>` : ''}
      ${process.analysis ? `<div class="process-analysis"><strong>Analysis:</strong><br>${process.analysis}</div>` : ''}
      ${process.result ? `<div class="process-result">${process.result}</div>` : ''}
      ${process.error ? `<div class="process-error">${process.error}</div>` : ''}
      <button class="process-close-btn" data-id="${process.id}">✖</button>
    `;
    card.querySelector('.process-close-btn').onclick = () => removeProcessCard(process.id);
    processContainer.appendChild(card);
  });
}

window.addProcessCard = addProcessCard;
window.updateProcessCard = updateProcessCard;
window.removeProcessCard = removeProcessCard;
