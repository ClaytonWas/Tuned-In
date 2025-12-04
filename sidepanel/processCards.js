// Minimal process list management for sidepanel UI
// Shows document title, progress bar, and one-word status

let processState = [];
let processIdCounter = 1;

const processContainer = document.createElement('ul');
processContainer.id = 'processListContainer';
processContainer.className = 'process-list';

// Insert after the now-playing-section, before history
const nowPlayingSection = document.querySelector('.now-playing-section');
if (nowPlayingSection && nowPlayingSection.nextSibling) {
  nowPlayingSection.parentNode.insertBefore(processContainer, nowPlayingSection.nextSibling);
} else {
  // Fallback: insert at start of main
  const main = document.querySelector('.main');
  if (main.firstChild) {
    main.insertBefore(processContainer, main.firstChild.nextSibling);
  }
}

// Map progress percentage to analysis phase
function getStatusWord(progress, status) {
  if (status === 'error') return 'Error';
  if (status === 'done' || progress >= 100) return 'Complete';
  if (progress < 25) return 'Extracting';
  if (progress < 50) return 'Summarizing';
  if (progress < 75) return 'Analyzing';
  return 'Matching';
}

function addProcessCard(type, description, pageTitle = null) {
  const id = processIdCounter++;
  const process = {
    id,
    type,
    description,
    pageTitle: pageTitle || description,
    progress: 0,
    status: 'running'
  };
  processState.push(process);
  renderProcessCards();
  return id;
}

function updateProcessCard(id, updates) {
  const idx = processState.findIndex(p => p.id === id);
  if (idx === -1) return;
  const prev = processState[idx];
  processState[idx] = { ...prev, ...updates };
  
  // Update progress bar smoothly without full re-render
  if (typeof updates.progress === 'number') {
    const item = document.querySelector(`.process-item[data-id='${id}']`);
    if (item) {
      const fill = item.querySelector('.process-bar-fill');
      const statusEl = item.querySelector('.process-status-word');
      if (fill) {
        fill.style.width = `${updates.progress}%`;
      }
      if (statusEl) {
        const newStatus = getStatusWord(updates.progress, processState[idx].status);
        statusEl.textContent = newStatus;
        // Update status class
        statusEl.className = 'process-status-word ' + 
          (processState[idx].status === 'error' ? 'status-error' : 
           processState[idx].status === 'done' ? 'status-done' : 'status-running');
      }
    }
  }
  
  // Auto-dismiss completed items after 3 seconds
  if (updates.status === 'done' || (updates.progress === 100 && processState[idx].status !== 'error')) {
    setTimeout(() => {
      removeProcessCard(id);
    }, 3000);
  }
  
  // Re-render for non-progress updates
  if (typeof updates.progress !== 'number') {
    renderProcessCards();
  }
}

function removeProcessCard(id) {
  const item = document.querySelector(`.process-item[data-id='${id}']`);
  if (item) {
    item.classList.add('process-item-removing');
    setTimeout(() => {
      processState = processState.filter(p => p.id !== id);
      renderProcessCards();
    }, 200);
  } else {
    processState = processState.filter(p => p.id !== id);
    renderProcessCards();
  }
}

function renderProcessCards() {
  if (processState.length === 0) {
    processContainer.innerHTML = '';
    processContainer.setAttribute('hidden', '');
    return;
  }
  
  processContainer.removeAttribute('hidden');
  processContainer.innerHTML = '';
  
  processState.forEach(process => {
    const item = document.createElement('li');
    item.className = 'process-item';
    item.setAttribute('data-id', process.id);
    
    const statusWord = getStatusWord(process.progress, process.status);
    const statusClass = process.status === 'error' ? 'status-error' : 
                        process.status === 'done' ? 'status-done' : 'status-running';
    
    item.innerHTML = `
      <div class="process-item-content">
        <span class="process-page-title">${process.pageTitle}</span>
        <div class="process-bar">
          <div class="process-bar-fill" style="width: ${process.progress}%;"></div>
        </div>
        <span class="process-status-word ${statusClass}">${statusWord}</span>
      </div>
      <button class="process-dismiss" data-id="${process.id}" aria-label="Dismiss">×</button>
    `;
    
    item.querySelector('.process-dismiss').onclick = (e) => {
      e.stopPropagation();
      removeProcessCard(process.id);
    };
    
    processContainer.appendChild(item);
  });
}

window.addProcessCard = addProcessCard;
window.updateProcessCard = updateProcessCard;
window.removeProcessCard = removeProcessCard;
