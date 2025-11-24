// public/hod.js

let teacherQuizChart = null;

const hodLoginSection = document.getElementById("hodLoginSection");
const hodDashboardSection = document.getElementById("hodDashboardSection");

const hodUsernameInput = document.getElementById("hodUsername");
const hodPasswordInput = document.getElementById("hodPassword");
const hodLoginBtn = document.getElementById("hodLoginBtn");
const hodLoginStatus = document.getElementById("hodLoginStatus");
const hodLogoutBtn = document.getElementById("hodLogoutBtn");
const hodWelcomeLabel = document.getElementById("hodWelcomeLabel");

const filterFrom = document.getElementById("filterFrom");
const filterTo = document.getElementById("filterTo");
const filterTeacher = document.getElementById("filterTeacher");
const applyFiltersBtn = document.getElementById("applyFiltersBtn");

const downloadAllBtn = document.getElementById("downloadAllBtn");
const downloadTeacherBtn = document.getElementById("downloadTeacherBtn");

const statTeachers = document.getElementById("statTeachers");
const statQuizzes = document.getElementById("statQuizzes");
const statQuestions = document.getElementById("statQuestions");
const latestQuizzesBody = document.getElementById("latestQuizzesBody");
const teacherStatsBody = document.getElementById("teacherStatsBody");

const teacherQuizChartCanvas = document.getElementById("teacherQuizChart");
const hodOldPassword = document.getElementById("hodOldPassword");
const hodNewPassword = document.getElementById("hodNewPassword");
const hodConfirmPassword = document.getElementById("hodConfirmPassword");
const hodChangePasswordBtn = document.getElementById("hodChangePasswordBtn");
const hodChangePasswordStatus = document.getElementById(
  "hodChangePasswordStatus"
);
if (hodChangePasswordBtn) {
  hodChangePasswordBtn.addEventListener("click", () => {
    hodChangePasswordStatus.textContent = "";

    const oldPw = hodOldPassword.value.trim();
    const newPw = hodNewPassword.value.trim();
    const confirmPw = hodConfirmPassword.value.trim();

    if (!oldPw || !newPw || !confirmPw) {
      hodChangePasswordStatus.textContent = "Please fill all fields.";
      return;
    }

    if (newPw !== confirmPw) {
      hodChangePasswordStatus.textContent =
        "New password and confirm password do not match.";
      return;
    }

    fetch("/api/hod/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        oldPassword: oldPw,
        newPassword: newPw
      })
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          hodChangePasswordStatus.textContent =
            "Password updated successfully.";
          hodOldPassword.value = "";
          hodNewPassword.value = "";
          hodConfirmPassword.value = "";
        } else {
          hodChangePasswordStatus.textContent =
            res.error || "Error updating password.";
        }
      })
      .catch(() => {
        hodChangePasswordStatus.textContent =
          "Error updating password (network/server issue).";
      });
  });
}

function formatDateTime(dt) {
  if (!dt) return "-";
  const d = new Date(dt);
  if (isNaN(d.getTime())) return dt;
  return d.toLocaleString();
}

// ---------- HOD AUTH ----------
function checkHodSession() {
  fetch("/api/hod/me")
    .then((r) => r.json())
    .then((res) => {
      if (res.hod) {
        hodLoginSection.classList.add("hidden");
        hodDashboardSection.classList.remove("hidden");
        hodWelcomeLabel.textContent = `Logged in as HOD (${res.hod.username})`;
        loadTeachersForFilter();
        loadHodSummary();
      } else {
        hodLoginSection.classList.remove("hidden");
        hodDashboardSection.classList.add("hidden");
      }
    });
}

hodLoginBtn.addEventListener("click", () => {
  hodLoginStatus.textContent = "";
  fetch("/api/hod/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: hodUsernameInput.value.trim(),
      password: hodPasswordInput.value.trim()
    })
  })
    .then((r) => r.json())
    .then((res) => {
      if (res.success) {
        hodLoginStatus.textContent = "Login successful!";
        checkHodSession();
      } else {
        hodLoginStatus.textContent = res.error || "Login failed";
      }
    })
    .catch(() => {
      hodLoginStatus.textContent = "Error logging in";
    });
});

hodLogoutBtn.addEventListener("click", () => {
  fetch("/api/hod/logout", { method: "POST" })
    .then((r) => r.json())
    .then(() => {
      hodDashboardSection.classList.add("hidden");
      hodLoginSection.classList.remove("hidden");
    });
});

// ---------- TEACHER LIST FOR FILTER ----------
function loadTeachersForFilter() {
  fetch("/api/hod/teachers")
    .then((r) => r.json())
    .then((res) => {
      if (!res.success) return;
      filterTeacher.innerHTML = `<option value="">All Teachers</option>`;
      res.teachers.forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = `${t.name} (${t.email})`;
        filterTeacher.appendChild(opt);
      });
    })
    .catch((err) => {
      console.error("Error loading teachers:", err);
    });
}

// ---------- SUMMARY + CHART ----------
function buildQueryString() {
  const params = [];
  if (filterFrom.value) params.push(`from=${encodeURIComponent(filterFrom.value)}`);
  if (filterTo.value) params.push(`to=${encodeURIComponent(filterTo.value)}`);
  if (filterTeacher.value) params.push(`teacherId=${encodeURIComponent(filterTeacher.value)}`);
  return params.length ? "?" + params.join("&") : "";
}

function loadHodSummary() {
  const qs = buildQueryString();

  latestQuizzesBody.innerHTML = `<tr><td colspan="5">Loading...</td></tr>`;
  teacherStatsBody.innerHTML = `<tr><td colspan="4">Loading...</td></tr>`;

  fetch(`/api/hod/summary${qs}`)
    .then((r) => r.json())
    .then((res) => {
      if (!res.success) {
        statTeachers.textContent = "-";
        statQuizzes.textContent = "-";
        statQuestions.textContent = "-";
        latestQuizzesBody.innerHTML = `<tr><td colspan="5">Error loading data</td></tr>`;
        teacherStatsBody.innerHTML = `<tr><td colspan="4">Error loading data</td></tr>`;
        return;
      }

      const s = res.summary;

      statTeachers.textContent = s.totalTeachers;
      statQuizzes.textContent = s.totalQuizzes;
      statQuestions.textContent = s.totalQuestions;

      // Latest quizzes
      if (!s.latestQuizzes || s.latestQuizzes.length === 0) {
        latestQuizzesBody.innerHTML = `<tr><td colspan="5">No quizzes found for filter</td></tr>`;
      } else {
        latestQuizzesBody.innerHTML = "";
        s.latestQuizzes.forEach((q) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${q.title}</td>
            <td>${q.teacherName}</td>
            <td>${q.questionCount}</td>
            <td>${formatDateTime(q.created_at)}</td>
            <td><button data-quiz-id="${q.id}" class="download-quiz-btn">Download</button></td>
          `;
          latestQuizzesBody.appendChild(tr);
        });
      }

      // Teacher stats table
      if (!s.teacherStats || s.teacherStats.length === 0) {
        teacherStatsBody.innerHTML = `<tr><td colspan="4">No data for filter</td></tr>`;
      } else {
        teacherStatsBody.innerHTML = "";
        s.teacherStats.forEach((t) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${t.name}</td>
            <td>${t.email}</td>
            <td>${t.quizCount}</td>
            <td>${t.questionCount}</td>
          `;
          teacherStatsBody.appendChild(tr);
        });
      }

      // Build/Update chart
      buildTeacherChart(s.teacherStats || []);
    })
    .catch((err) => {
      console.error("HOD summary error:", err);
      latestQuizzesBody.innerHTML = `<tr><td colspan="5">Error loading data</td></tr>`;
      teacherStatsBody.innerHTML = `<tr><td colspan="4">Error loading data</td></tr>`;
    });
}

function buildTeacherChart(teacherStats) {
  if (!teacherQuizChartCanvas) return;

  const labels = teacherStats.map((t) => t.name);
  const quizData = teacherStats.map((t) => t.quizCount);
  const questionData = teacherStats.map((t) => t.questionCount);

  const data = {
    labels,
    datasets: [
      {
        label: "Quizzes",
        data: quizData,
        backgroundColor: "rgba(0, 201, 167, 0.7)"
      },
      {
        label: "Questions",
        data: questionData,
        backgroundColor: "rgba(255, 175, 0, 0.7)"
      }
    ]
  };

  if (teacherQuizChart) {
    teacherQuizChart.data = data;
    teacherQuizChart.update();
  } else {
    teacherQuizChart = new Chart(teacherQuizChartCanvas, {
      type: "bar",
      data,
      options: {
        responsive: true,
        scales: {
          x: { stacked: false },
          y: {
            beginAtZero: true,
            ticks: { precision: 0 }
          }
        }
      }
    });
  }
}

// ---------- FILTER BUTTON ----------
applyFiltersBtn.addEventListener("click", () => {
  loadHodSummary();
});

// ---------- DOWNLOAD BUTTONS ----------
downloadAllBtn.addEventListener("click", () => {
  const qs = buildQueryString();
  window.location = `/api/hod/export/all-questions${qs}`;
});

downloadTeacherBtn.addEventListener("click", () => {
  const teacherId = filterTeacher.value;
  if (!teacherId) {
    alert("Please select a teacher for teacher-wise download.");
    return;
  }
  const params = [];
  if (filterFrom.value) params.push(`from=${encodeURIComponent(filterFrom.value)}`);
  if (filterTo.value) params.push(`to=${encodeURIComponent(filterTo.value)}`);
  const qs = params.length ? "?" + params.join("&") : "";
  window.location = `/api/hod/export/teacher/${teacherId}${qs}`;
});

// Quiz-wise download from table button
latestQuizzesBody.addEventListener("click", (e) => {
  if (!e.target.classList.contains("download-quiz-btn")) return;
  const quizId = e.target.getAttribute("data-quiz-id");
  if (!quizId) return;
  window.location = `/api/hod/export/quiz/${quizId}`;
});

// ---------- INIT ----------
document.addEventListener("DOMContentLoaded", checkHodSession);
