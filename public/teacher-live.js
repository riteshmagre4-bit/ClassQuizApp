// public/teacher-live.js
const socket = io();

// DOM references
const livePinDisplay = document.getElementById("livePinDisplay");
const liveTitleDisplay = document.getElementById("liveTitleDisplay");
const liveQuestionsControl = document.getElementById("liveQuestionsControl");
const livePlayers = document.getElementById("livePlayers");
const leaderboard = document.getElementById("leaderboard");
const timerSecondsInput = document.getElementById("timerSecondsInput");

// Read query params: ?pin=1234&quizId=5&title=My+Quiz
const params = new URLSearchParams(window.location.search);
const livePin = params.get("pin");
const quizId = params.get("quizId");
const quizTitle = decodeURIComponent(params.get("title") || "");

livePinDisplay.textContent = livePin || "-";
liveTitleDisplay.textContent = quizTitle || "-";

let currentQuestionsForLive = [];

// NEW: back button
const backToDashboardBtn = document.getElementById("backToDashboardBtn");
if (backToDashboardBtn) {
  backToDashboardBtn.addEventListener("click", () => {
    window.location.href = "/teacher.html";
  });
}
// ---------- SOUND HELPERS ----------
function makeTone(freq, lengthMs, type = "sine") {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);

  gain.gain.setValueAtTime(0.25, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + lengthMs / 1000);

  osc.start();
  setTimeout(() => {
    osc.stop();
    ctx.close();
  }, lengthMs);
}

function soundFanfare() {
  makeTone(880, 180, "square");
  setTimeout(() => makeTone(660, 180, "square"), 190);
}

function soundClick() {
  makeTone(700, 120, "triangle");
}

function soundError() {
  makeTone(220, 300, "sawtooth");
}

// ---------- JOIN LIVE SESSION AS TEACHER ----------
function joinLiveAsTeacher() {
  if (!livePin) {
    alert("No PIN provided in URL. Open this page from the Teacher Dashboard.");
    return;
  }
  socket.emit("teacherJoinLive", { pin: livePin }, (res) => {
    if (!res || !res.success) {
      alert(res && res.message ? res.message : "Error joining live room");
      soundError();
      return;
    }
    soundFanfare();
  });
}

// ---------- BUILD QUESTION CONTROLS ----------
function buildLiveQuestionsControls() {
  if (!quizId) {
    liveQuestionsControl.textContent =
      "No quizId in URL. Open this page from the Teacher Dashboard.";
    return;
  }

  liveQuestionsControl.innerHTML = "Loading questions...";
  fetch(`/api/quizzes/${quizId}`)
    .then((r) => r.json())
    .then((res) => {
      if (!res.success) {
        liveQuestionsControl.textContent = "Error loading questions.";
        soundError();
        return;
      }

      const questions = res.questions || [];
      currentQuestionsForLive = questions;
      const totalQuestions = questions.length;
totalQuestionsDisplay.textContent = totalQuestions;

      if (!totalQuestions) {
        liveQuestionsControl.textContent = "This quiz has no questions.";
        return;
      }

      liveQuestionsControl.innerHTML = "";
      questions.forEach((q, index) => {
        const div = document.createElement("div");
        div.className = "live-question";
        div.innerHTML = `
          <span>Q${index + 1}: ${q.text}</span>
          <div>
            <button class="live-start" data-index="${index}" data-total="${totalQuestions}">Start</button>
            <button class="live-end" data-index="${index}">End</button>
          </div>
        `;
        liveQuestionsControl.appendChild(div);
      });

      liveQuestionsControl.onclick = (e) => {
        if (e.target.classList.contains("live-start")) {
          const idx = parseInt(e.target.dataset.index, 10);
          const sec = parseInt(timerSecondsInput.value, 10) || 20;
          const total = parseInt(e.target.dataset.total, 10) || totalQuestions;
          socket.emit("startQuestion", {
            pin: livePin,
            questionIndex: idx,
            timerSeconds: sec,
            totalQuestions: total
          });
          soundClick();
        } else if (e.target.classList.contains("live-end")) {
          socket.emit("endQuestion", { pin: livePin });
          soundClick();
        }
      };
    })
    .catch((err) => {
      console.error("Error loading quiz for live:", err);
      liveQuestionsControl.textContent = "Error loading questions.";
      soundError();
    });
}

// ---------- SOCKET EVENTS ----------
socket.on("playerListUpdate", (data) => {
  // Update student count
  totalStudentsDisplay.textContent = data.players.length;

  livePlayers.innerHTML = "";
  data.players.forEach((p) => {
    const li = document.createElement("li");
    li.className = "player-item new";
    li.innerHTML = `
      <div class="avatar-circle">${p.avatar || "🙂"}</div>
      <span>${p.name}</span>
      <span style="margin-left:auto;">${p.score}</span>
    `;
    livePlayers.appendChild(li);
    setTimeout(() => li.classList.remove("new"), 250);
  });
});


socket.on("questionEnded", (data) => {
  leaderboard.innerHTML = "";
data.scoreboard.forEach((p, idx) => {
  const li = document.createElement("li");
  li.className = "leaderboard-item";
  const rank = idx + 1;

  // Convert ms → seconds with 1 decimal
  const timeSec = (p.totalTimeMs / 1000).toFixed(1);

  li.innerHTML = `
    <span class="rank-badge">#${rank}</span>
    <div class="avatar-circle">${p.avatar || "🙂"}</div>
    
    <div class="leader-info">
      <strong>${p.name}</strong><br>
      <small>Time: ${timeSec}s</small>
    </div>

    <span class="leader-score">${p.score}</span>
  `;

  leaderboard.appendChild(li);

  // animation
  setTimeout(() => {
    li.classList.add("pop");
  }, idx * 120);
});

  soundFanfare();
});

// ---------- INIT ----------
document.addEventListener("DOMContentLoaded", () => {
  joinLiveAsTeacher();
  buildLiveQuestionsControls();
});
const totalQuestionsDisplay = document.getElementById("totalQuestionsDisplay");
const totalStudentsDisplay = document.getElementById("totalStudentsDisplay");
