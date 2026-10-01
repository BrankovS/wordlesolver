"use strict";

const BUNDLED_WORD_FILE = "five_letter_words.txt";
const STORAGE_KEY = "wordleSolver.wordList.v1";
const MAX_ANSWERS_SHOWN = 10;
const MAX_RECOMMENDATIONS = 10;

const COMMON_STARTER_POOL = [
  "slate","crane","trace","stare","raise","arise","irate","later","alter","alert",
  "crate","cater","react","tears","rates","tares","snare","learn","renal","least",
  "stole","stone","notes","tones","train","trail","roast","coast","ratio","adieu",
  "audio","stair","store","shore","share","heart","earth","their","other","route"
];

let allWords = [];
let guesses = [];
let feedback = ["B","B","B","B","B"];
let possible = [];

const el = {
  wordListStatus: document.getElementById("wordListStatus"),
  wordFileInput: document.getElementById("wordFileInput"),
  starterList: document.getElementById("starterList"),
  guessInput: document.getElementById("guessInput"),
  feedbackRow: document.getElementById("feedbackRow"),
  addGuessBtn: document.getElementById("addGuessBtn"),
  undoBtn: document.getElementById("undoBtn"),
  resetBtn: document.getElementById("resetBtn"),
  history: document.getElementById("history"),
  message: document.getElementById("message"),
  remainingCount: document.getElementById("remainingCount"),
  rankingMode: document.getElementById("rankingMode"),
  recommendationList: document.getElementById("recommendationList"),
  answerList: document.getElementById("answerList"),
};

function sanitizeWords(text) {
  return [...new Set(
    text
      .split(/\r?\n/)
      .map(x => x.trim().toLowerCase())
      .filter(x => /^[a-z]{5}$/.test(x))
  )].sort();
}

async function loadWordList() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length) {
        allWords = parsed;
        finishWordListLoad("saved on this device");
        return;
      }
    } catch (_) {}
  }

  try {
    const response = await fetch(BUNDLED_WORD_FILE, { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load bundled word list.");

    const text = await response.text();
    allWords = sanitizeWords(text);

    if (!allWords.length) throw new Error("Bundled word list is empty.");

    finishWordListLoad("bundled with the site");
  } catch (error) {
    el.wordListStatus.textContent = "No word list loaded — import your .txt file.";
    el.starterList.innerHTML = '<p class="muted">Import your 5-letter word list first.</p>';
    el.remainingCount.textContent = "No list loaded";
  }
}

function finishWordListLoad(source) {
  possible = [...allWords];
  el.wordListStatus.textContent =
    `${allWords.toLocaleString()} words loaded (${source}).`;
  renderAnswers();
  calculateStarters();
}

function wordlePattern(guess, answer) {
  const result = ["B","B","B","B","B"];
  const remaining = answer.split("");

  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) {
      result[i] = "G";
      remaining[i] = null;
    }
  }

  for (let i = 0; i < 5; i++) {
    if (result[i] === "G") continue;

    const index = remaining.indexOf(guess[i]);
    if (index !== -1) {
      result[i] = "Y";
      remaining[index] = null;
    }
  }

  return result.join("");
}

function filterPossible() {
  possible = allWords.filter(candidate =>
    guesses.every(item => wordlePattern(item.word, candidate) === item.pattern)
  );
}

function getFrequencyData(candidates) {
  const letterFreq = new Map();
  const posFreq = Array.from({ length: 5 }, () => new Map());

  for (const word of candidates) {
    for (const letter of new Set(word)) {
      letterFreq.set(letter, (letterFreq.get(letter) || 0) + 1);
    }

    for (let i = 0; i < 5; i++) {
      const map = posFreq[i];
      const letter = word[i];
      map.set(letter, (map.get(letter) || 0) + 1);
    }
  }

  return { letterFreq, posFreq };
}

function heuristicScore(word, candidates, freqData = null) {
  const { letterFreq, posFreq } = freqData || getFrequencyData(candidates);
  let score = 0;

  for (const letter of new Set(word)) {
    score += letterFreq.get(letter) || 0;
  }

  for (let i = 0; i < 5; i++) {
    score += 0.38 * (posFreq[i].get(word[i]) || 0);
  }

  const duplicates = 5 - new Set(word).size;
  score -= duplicates * candidates.length * 0.8;

  return score;
}

function heuristicRank(wordsToScore, candidates, limit = wordsToScore.length) {
  const freqData = getFrequencyData(candidates);

  return wordsToScore
    .map(word => ({
      word,
      score: heuristicScore(word, candidates, freqData)
    }))
    .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word))
    .slice(0, limit)
    .map(x => x.word);
}

function exactGuessStats(guess, candidates) {
  const groups = new Map();

  for (const answer of candidates) {
    const pattern = wordlePattern(guess, answer);
    groups.set(pattern, (groups.get(pattern) || 0) + 1);
  }

  const total = candidates.length;
  let squareSum = 0;
  let entropy = 0;
  let worstCase = 0;

  for (const count of groups.values()) {
    squareSum += count * count;
    worstCase = Math.max(worstCase, count);

    const p = count / total;
    entropy -= p * Math.log2(p);
  }

  return {
    expectedRemaining: squareSum / total,
    entropy,
    worstCase
  };
}

function recommendationCandidates(candidates) {
  if (candidates.length <= 2) return [...candidates];

  let shortlistSize;
  if (candidates.length > 10000) shortlistSize = 45;
  else if (candidates.length > 5000) shortlistSize = 60;
  else if (candidates.length > 1500) shortlistSize = 90;
  else if (candidates.length > 400) shortlistSize = 130;
  else if (candidates.length > 120) shortlistSize = 180;
  else shortlistSize = 260;

  const pool = candidates.length <= 80 ? allWords : allWords;
  const shortlist = heuristicRank(pool, candidates, shortlistSize);

  // Make sure strong possible answers are represented too.
  const bestAnswers = heuristicRank(candidates, candidates, Math.min(50, candidates.length));

  return [...new Set([...shortlist, ...bestAnswers])];
}

function bestGuesses(candidates, limit = MAX_RECOMMENDATIONS) {
  if (!candidates.length) return [];
  if (candidates.length === 1) {
    return [{
      word: candidates[0],
      expectedRemaining: 1,
      entropy: 0,
      worstCase: 1,
      possibleAnswer: true
    }];
  }

  const candidateWords = recommendationCandidates(candidates);
  const possibleSet = new Set(candidates);

  return candidateWords
    .map(word => {
      const stats = exactGuessStats(word, candidates);
      return {
        word,
        ...stats,
        possibleAnswer: possibleSet.has(word)
      };
    })
    .sort((a, b) =>
      a.expectedRemaining - b.expectedRemaining ||
      a.worstCase - b.worstCase ||
      Number(b.possibleAnswer) - Number(a.possibleAnswer) ||
      b.entropy - a.entropy ||
      a.word.localeCompare(b.word)
    )
    .slice(0, limit);
}

function calculateStarters() {
  if (!allWords.length) return;

  el.starterList.innerHTML = '<div class="loading">Calculating…</div>';

  // Let the UI paint before doing the work.
  setTimeout(() => {
    const commonPool = COMMON_STARTER_POOL.filter(w => allWords.includes(w));
    const basePool = commonPool.length >= 8
      ? commonPool
      : heuristicRank(allWords, allWords, 55);

    // Add a few data-driven candidates too, while still avoiding a page full of obscure words.
    const dataDriven = heuristicRank(allWords, allWords, 25);
    const pool = [...new Set([...basePool, ...dataDriven])];

    const ranked = pool
      .map(word => ({ word, ...exactGuessStats(word, allWords) }))
      .sort((a, b) =>
        a.expectedRemaining - b.expectedRemaining ||
        a.worstCase - b.worstCase ||
        b.entropy - a.entropy
      )
      .slice(0, 3);

    renderRecommendationRows(el.starterList, ranked, true);
  }, 30);
}

function addGuess() {
  clearMessage();

  const word = el.guessInput.value.trim().toLowerCase();

  if (!allWords.length) {
    showMessage("Import a word list first.");
    return;
  }

  if (!/^[a-z]{5}$/.test(word)) {
    showMessage("Enter exactly 5 letters.");
    return;
  }

  guesses.push({
    word,
    pattern: feedback.join("")
  });

  el.guessInput.value = "";
  feedback = ["B","B","B","B","B"];
  renderFeedback();
  filterPossible();
  renderHistory();
  renderAnswers();
  calculateNextGuesses();
}

function calculateNextGuesses() {
  if (!possible.length) {
    el.rankingMode.textContent = "No match";
    el.recommendationList.innerHTML =
      '<p class="muted">No words match all entered feedback.</p>';
    return;
  }

  if (possible.length === 1) {
    el.rankingMode.textContent = "Solved";
    renderRecommendationRows(el.recommendationList, [{
      word: possible[0],
      expectedRemaining: 1,
      entropy: 0,
      worstCase: 1,
      possibleAnswer: true
    }]);
    return;
  }

  el.rankingMode.textContent = "Calculating…";
  el.recommendationList.innerHTML = '<div class="loading">Finding best next guesses…</div>';

  setTimeout(() => {
    const ranked = bestGuesses(possible);
    el.rankingMode.textContent =
      possible.length > 1500 ? "Shortlist + exact score" : "Exact score";
    renderRecommendationRows(el.recommendationList, ranked);
  }, 20);
}

function renderRecommendationRows(container, rows, starter = false) {
  container.innerHTML = "";

  rows.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "rec-row";

    const expected = Number.isFinite(item.expectedRemaining)
      ? item.expectedRemaining.toFixed(item.expectedRemaining < 10 ? 1 : 0)
      : "—";

    row.innerHTML = `
      <span class="rec-rank">${index + 1}</span>
      <div>
        <div class="rec-word">${item.word.toUpperCase()}</div>
        <div class="rec-meta">
          ${starter ? "starter" : (item.possibleAnswer ? "possible answer" : "probe")}
          · avg left ${expected}
        </div>
      </div>
      <button class="use-word" type="button" data-word="${item.word}">Use</button>
    `;

    row.querySelector(".use-word").addEventListener("click", () => {
      el.guessInput.value = item.word.toUpperCase();
      el.guessInput.focus();
    });

    container.appendChild(row);
  });
}

function renderAnswers() {
  el.answerList.innerHTML = "";

  if (!allWords.length) {
    el.remainingCount.textContent = "No list loaded";
    return;
  }

  el.remainingCount.textContent =
    `${possible.toLocaleString()} possible ${possible.length === 1 ? "answer" : "answers"}`;

  if (!possible.length) return;

  const ranked = heuristicRank(possible, possible, MAX_ANSWERS_SHOWN);

  for (const word of ranked) {
    const li = document.createElement("li");
    li.textContent = word.toUpperCase();
    el.answerList.appendChild(li);
  }
}

function renderHistory() {
  el.history.innerHTML = "";

  guesses.forEach(item => {
    const row = document.createElement("div");
    row.className = "history-row";

    const tiles = item.pattern
      .split("")
      .map((state, i) => {
        const cls = state === "G" ? "green" : state === "Y" ? "yellow" : "gray";
        return `<span class="mini-tile ${cls}">${item.word[i].toUpperCase()}</span>`;
      })
      .join("");

    row.innerHTML = `
      <span class="history-word">${item.word.toUpperCase()}</span>
      <span class="mini-tiles">${tiles}</span>
    `;

    el.history.appendChild(row);
  });

  el.undoBtn.disabled = guesses.length === 0;
}

function renderFeedback() {
  const buttons = el.feedbackRow.querySelectorAll(".tile");

  buttons.forEach((button, i) => {
    const state = feedback[i];
    button.classList.remove("gray","yellow","green");

    if (state === "G") {
      button.classList.add("green");
      button.textContent = "G";
      button.setAttribute("aria-label", `Letter ${i + 1}: green`);
    } else if (state === "Y") {
      button.classList.add("yellow");
      button.textContent = "Y";
      button.setAttribute("aria-label", `Letter ${i + 1}: yellow`);
    } else {
      button.classList.add("gray");
      button.textContent = "B";
      button.setAttribute("aria-label", `Letter ${i + 1}: gray`);
    }
  });
}

function cycleFeedback(index) {
  const order = ["B","Y","G"];
  const current = feedback[index];
  feedback[index] = order[(order.indexOf(current) + 1) % order.length];
  renderFeedback();
}

function undoGuess() {
  if (!guesses.length) return;

  guesses.pop();
  filterPossible();
  renderHistory();
  renderAnswers();

  if (guesses.length) {
    calculateNextGuesses();
  } else {
    el.recommendationList.innerHTML =
      '<p class="muted">Enter a guess to begin.</p>';
    el.rankingMode.textContent = "Ready";
  }
}

function resetSolver() {
  guesses = [];
  possible = [...allWords];
  feedback = ["B","B","B","B","B"];
  el.guessInput.value = "";

  renderFeedback();
  renderHistory();
  renderAnswers();

  el.recommendationList.innerHTML =
    '<p class="muted">Enter a guess to begin.</p>';
  el.rankingMode.textContent = "Ready";
  clearMessage();
}

function showMessage(text) {
  el.message.textContent = text;
}

function clearMessage() {
  el.message.textContent = "";
}

async function importWordList(file) {
  if (!file) return;

  const text = await file.text();
  const words = sanitizeWords(text);

  if (!words.length) {
    showMessage("That file does not contain valid 5-letter words.");
    return;
  }

  allWords = words;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(words));

  guesses = [];
  feedback = ["B","B","B","B","B"];
  possible = [...allWords];

  finishWordListLoad("imported and saved locally");
  renderFeedback();
  renderHistory();

  el.recommendationList.innerHTML =
    '<p class="muted">Enter a guess to begin.</p>';
  el.rankingMode.textContent = "Ready";
  clearMessage();
}

el.feedbackRow.querySelectorAll(".tile").forEach(button => {
  button.addEventListener("click", () => {
    cycleFeedback(Number(button.dataset.index));
  });
});

el.addGuessBtn.addEventListener("click", addGuess);
el.undoBtn.addEventListener("click", undoGuess);
el.resetBtn.addEventListener("click", resetSolver);

el.guessInput.addEventListener("input", () => {
  el.guessInput.value =
    el.guessInput.value.replace(/[^a-zA-Z]/g, "").slice(0, 5).toUpperCase();
});

el.guessInput.addEventListener("keydown", event => {
  if (event.key === "Enter") addGuess();
});

el.wordFileInput.addEventListener("change", async event => {
  await importWordList(event.target.files[0]);
  event.target.value = "";
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

renderFeedback();
loadWordList();