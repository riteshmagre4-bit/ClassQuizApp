const socket = io();

const params = new URLSearchParams(window.location.search);
const pin = params.get("pin");

document.getElementById("projectorPin").textContent = pin || "----";

const titleEl = document.getElementById("projectorQuizTitle");
const questionEl = document.getElementById("projectorQuestion");
const optionsEl = document.getElementById("projectorOptions");
const statsEl = document.getElementById("projectorAnswerStats");
const leaderboardEl = document.getElementById("projectorLeaderboard");

if (!pin) {
  questionEl.textContent = "No PIN provided in URL.";
}

// JOIN projector room (same as student join but without name)
socket.emit("joinLiveQuiz", { pin, studentName: "PROJECTOR" }, (res) => {
  if (!res || !res.success) {
    questionEl.textContent = "Invalid PIN";
  } else {
    titleEl.textContent = res.quizTitle || "";
  }
});

// When teacher starts a question
socket.on("questionStarted", (data) => {
  statsEl.classList.add("hidden");
  leaderboardEl.classList.add("hidden");

  const q = data.question;

  questionEl.textContent = q.text;

  // show options
  optionsEl.innerHTML = "";
  q.options.forEach((opt, i) => {
    const div = document.createElement("div");
    div.className = "projector-option";
    div.textContent = opt;
    optionsEl.appendChild(div);
  });
});

// When teacher ends a question
socket.on("questionEnded", (data) => {
  const { correctIndex, answerStats, scoreboard } = data;

  // highlight correct option
  const optionDivs = document.querySelectorAll(".projector-option");
  optionDivs.forEach((div, i) => {
    if (i === correctIndex) {
      div.classList.add("correct");
    } else {
      div.classList.add("wrong");
    }
  });

  // answer stats
  statsEl.classList.remove("hidden");
  statsEl.innerHTML = "<h2>Answer Distribution</h2>";
  answerStats.forEach((count, i) => {
    statsEl.innerHTML += `<div>Option ${i + 1}: ${count} answers</div>`;
  });

  // leaderboard
  leaderboardEl.classList.remove("hidden");
  leaderboardEl.innerHTML = "<h2>Leaderboard</h2>";

  scoreboard.forEach((p, idx) => {
    leaderboardEl.innerHTML += `
      <div class="lb-item">
        <span class="rank">#${idx + 1}</span>
        <span class="name">${p.name}</span>
        <span class="score">${p.score}</span>
      </div>
    `;
  });
});
