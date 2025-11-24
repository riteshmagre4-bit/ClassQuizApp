// public/teacher.js

// Tabs for login/register
const tabs = document.querySelectorAll(".tab");
const tabContents = document.querySelectorAll(".tab-content");
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    tabContents.forEach((c) => c.classList.add("hidden"));
    document.getElementById(tab.dataset.tab).classList.remove("hidden");
  });
});

// Auth elements
const authSection = document.getElementById("authSection");
const dashboardSection = document.getElementById("dashboardSection");
const teacherNameDisplay = document.getElementById("teacherNameDisplay");

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const loginStatus = document.getElementById("loginStatus");

const regName = document.getElementById("regName");
const regEmail = document.getElementById("regEmail");
const regPassword = document.getElementById("regPassword");
const registerBtn = document.getElementById("registerBtn");
const registerStatus = document.getElementById("registerStatus");

const logoutBtn = document.getElementById("logoutBtn");

// Quiz builder
const quizTitleInput = document.getElementById("quizTitle");
const questionsContainer = document.getElementById("questionsContainer");
const addQuestionBtn = document.getElementById("addQuestionBtn");
const saveQuizBtn = document.getElementById("saveQuizBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const quizSaveStatus = document.getElementById("quizSaveStatus");
const editModeLabel = document.getElementById("editModeLabel");

// Quiz list
const quizList = document.getElementById("quizList");

let editingQuizId = null;

// ---------- SOUND ----------
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

// ---------- AUTH HELPERS ----------
function showDashboard(teacher) {
  teacherNameDisplay.textContent = `Hi, ${teacher.name} (${teacher.email})`;
  authSection.classList.add("hidden");
  dashboardSection.classList.remove("hidden");
  loadQuizzes();
}

fetch("/api/auth/me")
  .then((r) => r.json())
  .then((data) => {
    if (data.teacher) {
      showDashboard(data.teacher);
    }
  });

// Login
loginBtn.addEventListener("click", () => {
  loginStatus.textContent = "";
  fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: loginEmail.value.trim(),
      password: loginPassword.value.trim()
    })
  })
    .then((r) => r.json())
    .then((res) => {
      if (res.success) {
        showDashboard(res.teacher);
        soundFanfare();
      } else {
        loginStatus.textContent = res.error || "Login failed";
        soundError();
      }
    })
    .catch(() => {
      loginStatus.textContent = "Error logging in";
      soundError();
    });
});

// Register
registerBtn.addEventListener("click", () => {
  registerStatus.textContent = "";
  fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: regName.value.trim(),
      email: regEmail.value.trim(),
      password: regPassword.value.trim()
    })
  })
    .then((r) => r.json())
    .then((res) => {
      if (res.success) {
        showDashboard(res.teacher);
        soundFanfare();
      } else {
        registerStatus.textContent = res.error || "Register failed";
        soundError();
      }
    })
    .catch(() => {
      registerStatus.textContent = "Error registering";
      soundError();
    });
});

// Logout
logoutBtn.addEventListener("click", () => {
  fetch("/api/auth/logout", { method: "POST" })
    .then((r) => r.json())
    .then(() => {
      dashboardSection.classList.add("hidden");
      authSection.classList.remove("hidden");
    });
});

// ---------- QUIZ BUILDER ----------
function addQuestionBlock(initialData) {
  const idx = questionsContainer.children.length + 1;
  const div = document.createElement("div");
  div.className = "question-block";
  div.innerHTML = `
    <h3>Q${idx}</h3>
    <input type="text" class="q-text" placeholder="Question text" />
    <input type="text" class="q-option" placeholder="Option A" />
    <input type="text" class="q-option" placeholder="Option B" />
    <input type="text" class="q-option" placeholder="Option C" />
    <input type="text" class="q-option" placeholder="Option D" />
    <label>Correct option index (0-3):</label>
    <input type="number" class="q-correct" min="0" max="3" value="0" />
  `;
  questionsContainer.appendChild(div);

  if (initialData) {
    div.querySelector(".q-text").value = initialData.text || "";
    const optInputs = div.querySelectorAll(".q-option");
    initialData.options.forEach((opt, i) => {
      if (optInputs[i]) optInputs[i].value = opt.text;
    });
    div.querySelector(".q-correct").value =
      initialData.correctIndex != null ? initialData.correctIndex : 0;
  }
}

function resetBuilderToNewQuiz() {
  editingQuizId = null;
  editModeLabel.classList.add("hidden");
  cancelEditBtn.classList.add("hidden");
  saveQuizBtn.textContent = "Save Quiz";
  quizTitleInput.value = "";
  questionsContainer.innerHTML = "";
  addQuestionBlock();
  quizSaveStatus.textContent = "";
}

addQuestionBtn.addEventListener("click", () => {
  addQuestionBlock();
  soundClick();
});

// initial
resetBuilderToNewQuiz();

// Save/create or update quiz
saveQuizBtn.addEventListener("click", () => {
  quizSaveStatus.textContent = "";
  const title = quizTitleInput.value.trim();
  if (!title) {
    quizSaveStatus.textContent = "Please enter quiz title";
    soundError();
    return;
  }

  const questions = [];
  const blocks = document.querySelectorAll(".question-block");
  blocks.forEach((block) => {
    const text = block.querySelector(".q-text").value.trim();
    const opts = Array.from(block.querySelectorAll(".q-option")).map((i) =>
      i.value.trim()
    );
    const correctIndex = parseInt(
      block.querySelector(".q-correct").value,
      10
    );
    if (text && opts.every((o) => o)) {
      questions.push({ text, options: opts, correctIndex });
    }
  });

  if (questions.length === 0) {
    quizSaveStatus.textContent = "Add at least one full question.";
    soundError();
    return;
  }

  const payload = { title, questions };

  if (!editingQuizId) {
    // CREATE
    fetch("/api/quizzes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          quizSaveStatus.textContent = "Quiz saved!";
          resetBuilderToNewQuiz();
          loadQuizzes();
          soundFanfare();
        } else {
          quizSaveStatus.textContent = res.error || "Error saving quiz";
          soundError();
        }
      })
      .catch(() => {
        quizSaveStatus.textContent = "Error saving quiz";
        soundError();
      });
  } else {
    // UPDATE
    fetch(`/api/quizzes/${editingQuizId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          quizSaveStatus.textContent = "Quiz updated!";
          resetBuilderToNewQuiz();
          loadQuizzes();
          soundFanfare();
        } else {
          quizSaveStatus.textContent = res.error || "Error updating quiz";
          soundError();
        }
      })
      .catch(() => {
        quizSaveStatus.textContent = "Error updating quiz";
        soundError();
      });
  }
});

cancelEditBtn.addEventListener("click", () => {
  resetBuilderToNewQuiz();
  soundClick();
});

// ---------- QUIZ LIST ----------
function loadQuizzes() {
  quizList.innerHTML = "<li>Loading...</li>";
  fetch("/api/quizzes")
    .then((r) => r.json())
    .then((res) => {
      if (!res.success) {
        quizList.innerHTML = "<li>Error loading quizzes</li>";
        return;
      }
      quizList.innerHTML = "";
      res.quizzes.forEach((q) => {
        const li = document.createElement("li");
        li.className = "quiz-item";
        const created = new Date(q.created_at).toLocaleString();
        li.innerHTML = `
          <div>
            <div>${q.title}</div>
            <small>Created: ${created}</small>
          </div>
          <div class="quiz-item-actions">
            <button data-id="${q.id}" class="start-live-btn">Start Live</button>
            <button data-id="${q.id}" class="edit-quiz-btn">Edit</button>
            <button data-id="${q.id}" class="delete-quiz-btn">Delete</button>
          </div>
        `;
        quizList.appendChild(li);
      });
    });
}

// Handle Start Live / Edit / Delete
quizList.addEventListener("click", (e) => {
  const btn = e.target;
  const quizId = btn.getAttribute("data-id");
  if (!quizId) return;

  if (btn.classList.contains("start-live-btn")) {
    // Start live, then open separate live page
    fetch(`/api/quizzes/${quizId}/start-live`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    })
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) {
          alert(res.error || "Cannot start live session");
          soundError();
          return;
        }
        const pin = res.pin;
        const title = res.title || "";
        const url = `/teacher-live.html?pin=${encodeURIComponent(
          pin
        )}&quizId=${encodeURIComponent(quizId)}&title=${encodeURIComponent(
          title
        )}`;
        window.open(url, "_blank");
        alert(
          `Live session started.\nPIN: ${pin}\nA new window has opened with live controls.`
        );
        soundFanfare();
      });
  } else if (btn.classList.contains("edit-quiz-btn")) {
    enterEditMode(quizId);
  } else if (btn.classList.contains("delete-quiz-btn")) {
    if (confirm("Are you sure you want to delete this quiz?")) {
      fetch(`/api/quizzes/${quizId}`, { method: "DELETE" })
        .then((r) => r.json())
        .then((res) => {
          if (res.success) {
            loadQuizzes();
            soundClick();
          } else {
            alert(res.error || "Error deleting quiz");
            soundError();
          }
        })
        .catch(() => {
          alert("Error deleting quiz");
          soundError();
        });
    }
  }
});

// Edit mode: load quiz into builder
function enterEditMode(quizId) {
  fetch(`/api/quizzes/${quizId}`)
    .then((r) => r.json())
    .then((res) => {
      if (!res.success) {
        quizSaveStatus.textContent = res.error || "Cannot load quiz for edit";
        soundError();
        return;
      }

      const quiz = res.quiz;
      const questions = res.questions || [];

      editingQuizId = quiz.id;
      editModeLabel.classList.remove("hidden");
      cancelEditBtn.classList.remove("hidden");
      saveQuizBtn.textContent = "Update Quiz";

      quizTitleInput.value = quiz.title;
      questionsContainer.innerHTML = "";

      questions.forEach((q) => {
        const correctIndex = q.options.findIndex((o) => o.is_correct);
        addQuestionBlock({
          text: q.text,
          options: q.options,
          correctIndex: correctIndex >= 0 ? correctIndex : 0
        });
      });

      quizSaveStatus.textContent = "Editing existing quiz.";
      soundClick();
    })
    .catch(() => {
      quizSaveStatus.textContent = "Error loading quiz for edit";
      soundError();
    });
}
