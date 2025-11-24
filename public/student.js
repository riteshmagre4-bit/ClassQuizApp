// public/student.js
const socket = io();

const studentNameInput = document.getElementById("studentName");
const pinInput = document.getElementById("pinInput");
const joinBtn = document.getElementById("joinBtn");
const joinStatus = document.getElementById("joinStatus");

const quizSection = document.getElementById("quizSection");
const quizTitleEl = document.getElementById("quizTitle");
const timerDisplay = document.getElementById("timerDisplay");
const questionArea = document.getElementById("questionArea");
const questionTextEl = document.getElementById("questionText");
const optionsContainer = document.getElementById("optionsContainer");
const infoText = document.getElementById("infoText");

const myAvatarCircle = document.getElementById("myAvatarCircle");
const myNameLabel = document.getElementById("myNameLabel");
const myPinLabel = document.getElementById("myPinLabel");

let currentPin = null;
let currentQuestionIndex = null;
let timerInterval = null;
let myAvatar = "🙂";
let myName = "Student";

let currentOptions = [];      // store options text
let lastSelectedIndex = null; // remember which option the student chose
let totalQuestions = 0;
let questionProgressBar = document.getElementById("questionProgressBar");

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

  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + lengthMs / 1000);

  osc.start();
  setTimeout(() => {
    osc.stop();
    ctx.close();
  }, lengthMs);
}

function soundClick() {
  makeTone(700, 120, "square");
}

function soundCountdownTick() {
  makeTone(900, 60, "square");
}

function soundTimeUp() {
  makeTone(220, 350, "sawtooth");
}

function soundJoin() {
  makeTone(600, 180, "triangle");
}

// ---------- JOIN ----------
joinBtn.addEventListener("click", () => {
  const name = studentNameInput.value.trim() || "Student";
  const pin = pinInput.value.trim();

  if (!pin) {
    joinStatus.textContent = "Enter PIN";
    joinStatus.className = "error";
    return;
  }

  console.log("Joining live quiz with PIN:", pin);

  socket.emit("joinLiveQuiz", { pin, studentName: name }, (res) => {
    console.log("joinLiveQuiz response:", res);

    if (!res || !res.success) {
      joinStatus.textContent = res ? res.message || "Join failed" : "Join failed";
      joinStatus.className = "error";
      return;
    }

    currentPin = pin;
    myName = name;
    myAvatar = res.avatar || "🙂";

    quizTitleEl.textContent = res.quizTitle;
    joinStatus.textContent = `Joined as ${name} ${myAvatar}`;
    joinStatus.className = "success";

    myAvatarCircle.textContent = myAvatar;
    myNameLabel.textContent = myName;
    myPinLabel.textContent = `PIN: ${currentPin}`;

    document.getElementById("joinSection").classList.add("hidden");
    quizSection.classList.remove("hidden");
    soundJoin();
  });
});

// ---------- TIMER ----------
function startTimer(seconds) {
  if (timerInterval) clearInterval(timerInterval);
  let remaining = seconds;
  timerDisplay.textContent = `⏱ ${remaining}s`;
  timerInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      timerDisplay.textContent = "⏱ Time up!";
      clearInterval(timerInterval);
      soundTimeUp();
    } else {
      timerDisplay.textContent = `⏱ ${remaining}s`;
      soundCountdownTick();
    }
  }, 1000);
}

// ---------- QUESTION STARTED ----------
socket.on("questionStarted", (data) => {
  console.log("questionStarted event:", data);

  currentQuestionIndex = data.questionIndex;
  const q = data.question || {};

  // store options & reset selection
  currentOptions = Array.isArray(q.options) ? q.options : [];
  lastSelectedIndex = null;

  // update progress bar
  if (typeof data.totalQuestions === "number") {
    totalQuestions = data.totalQuestions;
  }
  if (totalQuestions > 0 && questionProgressBar) {
    const currentNumber = currentQuestionIndex + 1;
    const pct = (currentNumber / totalQuestions) * 100;
    questionProgressBar.style.width = pct + "%";
  }

  // animate card
  questionArea.classList.remove("hidden");
  questionArea.classList.remove("show");
  void questionArea.offsetWidth; // force reflow for animation
  questionArea.classList.add("show");

  questionTextEl.textContent = q.text || "Question";
  quizTitleEl.textContent = quizTitleEl.textContent || "Quiz";

  optionsContainer.innerHTML = "";

  console.log("Options received:", currentOptions);

  if (!currentOptions.length) {
    infoText.textContent =
      "No options received for this question. Ask teacher to re-check quiz.";
    return;
  }

  const optionLabels = ["A", "B", "C", "D", "E", "F"];

  currentOptions.forEach((opt, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-btn";
    btn.dataset.index = idx.toString();

    btn.innerHTML = `
      <div class="option-label">${optionLabels[idx] || ""}</div>
      <div class="option-text">${opt}</div>
    `;

    btn.addEventListener("click", () => {
      // keep selection until student changes or question ends
      document.querySelectorAll(".option-btn").forEach((b) => {
        b.classList.remove("selected-option");
      });
      btn.classList.add("selected-option");
      lastSelectedIndex = idx;
      soundClick();

      socket.emit(
        "submitAnswer",
        {
          pin: currentPin,
          questionIndex: currentQuestionIndex,
          optionIndex: idx
        },
        (res) => {
          console.log("submitAnswer response:", res);
          if (res && res.success) {
            infoText.textContent =
              "Answer submitted. You can change it before teacher ends.";
          } else {
            infoText.textContent = "Error submitting answer.";
          }
        }
      );
    });

    optionsContainer.appendChild(btn);
  });

  infoText.textContent =
    "Select your answer. You can change it until the teacher ends the question.";
  startTimer(data.timerSeconds || 20);
});


// ---------- QUESTION ENDED ----------
socket.on("questionEnded", (data) => {
  console.log("questionEnded event:", data);

  if (timerInterval) clearInterval(timerInterval);
  timerDisplay.textContent = "⏱ Finished";

  const correctIndex = data.correctIndex;
  const correctText =
    currentOptions && currentOptions[correctIndex] !== undefined
      ? currentOptions[correctIndex]
      : "(unknown)";

  // Color code options
  const buttons = document.querySelectorAll(".option-btn");
  buttons.forEach((btn) => {
    const idx = parseInt(btn.dataset.index, 10);
    btn.disabled = true;

    if (idx === correctIndex) {
      btn.classList.add("correct-option");
    } else if (idx === lastSelectedIndex) {
      // student's wrong choice
      btn.classList.add("wrong-option");
    }
    // keep selected-option on whichever they tapped
  });

  infoText.innerHTML =
    `Question ended.<br>` +
    `Correct answer: <strong>${correctText}</strong><br>` +
    `Answers per option index: ${data.answerStats.join(", ")}<br>` +
    `Watch leaderboard on the teacher screen!`;

  soundTimeUp();
});
