// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const path = require("path");
const bcrypt = require("bcryptjs");
const db = require("./db");

// ---- HOD ADMIN SETUP ----
// Single HOD account stored in DB instead of hard-coded password
db.run(
  `CREATE TABLE IF NOT EXISTS hod_admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  )`,
  (err) => {
    if (err) {
      console.error("Error creating hod_admin table:", err);
    } else {
      // Ensure a default HOD user exists
      db.get(
        "SELECT * FROM hod_admin WHERE username = ?",
        ["hod"],
        (err2, row) => {
          if (err2) {
            console.error("Error checking HOD row:", err2);
            return;
          }
          if (!row) {
            const defaultPassHash = bcrypt.hashSync("hod123", 10);
            db.run(
              "INSERT INTO hod_admin (username, password_hash) VALUES (?, ?)",
              ["hod", defaultPassHash],
              (err3) => {
                if (err3) {
                  console.error("Error inserting default HOD:", err3);
                } else {
                  console.log(
                    "Default HOD created with username=hod, password=hod123"
                  );
                }
              }
            );
          }
        }
      );
    }
  }
);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;


// -------------------- MIDDLEWARE --------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "classquiz-secret",
    resave: false,
    saveUninitialized: false
  })
);

// serve static files from /public
app.use(express.static(path.join(__dirname, "public")));

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function sendCsv(res, filename, rows) {
  const header = [
    "Teacher Name",
    "Teacher Email",
    "Quiz Title",
    "Quiz Created At",
    "Question Text",
    "Option A",
    "Option B",
    "Option C",
    "Option D",
    "Correct Option"
  ];

  const lines = [header.map(csvEscape).join(",")];

  rows.forEach((r) => {
    lines.push(
      [
        r.teacherName,
        r.teacherEmail,
        r.quizTitle,
        r.created_at,
        r.question_text,
        r.optionA,
        r.optionB,
        r.optionC,
        r.optionD,
        r.correctOption
      ]
        .map(csvEscape)
        .join(",")
    );
  });

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  );
  res.send(lines.join("\n"));
}
// Export all questions as CSV (optional ?from,?to,?teacherId)
app.get("/api/hod/export/all-questions", requireHod, (req, res) => {
  const { from, to, teacherId } = req.query;
  const conditions = [];
  const params = [];

  if (from) {
    conditions.push("q.created_at >= ?");
    params.push(from + " 00:00:00");
  }
  if (to) {
    conditions.push("q.created_at <= ?");
    params.push(to + " 23:59:59");
  }
  if (teacherId) {
    conditions.push("t.id = ?");
    params.push(teacherId);
  }

  const whereClause = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

  const sql = `
    SELECT
      t.name AS teacherName,
      t.email AS teacherEmail,
      q.title AS quizTitle,
      q.created_at,
      qs.question_text,
      (SELECT option_text FROM options o2 WHERE o2.question_id = qs.id ORDER BY o2.id LIMIT 1 OFFSET 0) AS optionA,
      (SELECT option_text FROM options o2 WHERE o2.question_id = qs.id ORDER BY o2.id LIMIT 1 OFFSET 1) AS optionB,
      (SELECT option_text FROM options o2 WHERE o2.question_id = qs.id ORDER BY o2.id LIMIT 1 OFFSET 2) AS optionC,
      (SELECT option_text FROM options o2 WHERE o2.question_id = qs.id ORDER BY o2.id LIMIT 1 OFFSET 3) AS optionD,
      (SELECT option_text FROM options o2 WHERE o2.question_id = qs.id AND o2.is_correct = 1 LIMIT 1) AS correctOption
    FROM questions qs
    JOIN quizzes q ON qs.quiz_id = q.id
    JOIN teachers t ON q.teacher_id = t.id
    ${whereClause}
    ORDER BY t.name, q.title, qs.id
  `;

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error("Export all questions error:", err);
      return res.status(500).json({ error: "DB error (export all)" });
    }
    sendCsv(res, "all-questions.csv", rows || []);
  });
});
// Export questions for a specific teacher
app.get("/api/hod/export/teacher/:teacherId", requireHod, (req, res) => {
  const teacherId = req.params.teacherId;
  const { from, to } = req.query;
  const conditions = ["t.id = ?"];
  const params = [teacherId];

  if (from) {
    conditions.push("q.created_at >= ?");
    params.push(from + " 00:00:00");
  }
  if (to) {
    conditions.push("q.created_at <= ?");
    params.push(to + " 23:59:59");
  }

  const whereClause = "WHERE " + conditions.join(" AND ");

  const sql = `
    SELECT
      t.name AS teacherName,
      t.email AS teacherEmail,
      q.title AS quizTitle,
      q.created_at,
      qs.question_text,
      (SELECT option_text FROM options o2 WHERE o2.question_id = qs.id ORDER BY o2.id LIMIT 1 OFFSET 0) AS optionA,
      (SELECT option_text FROM options o2 WHERE o2.question_id = qs.id ORDER BY o2.id LIMIT 1 OFFSET 1) AS optionB,
      (SELECT option_text FROM options o2 WHERE o2.question_id = qs.id ORDER BY o2.id LIMIT 1 OFFSET 2) AS optionC,
      (SELECT option_text FROM options o2 WHERE o2.question_id = qs.id ORDER BY o2.id LIMIT 1 OFFSET 3) AS optionD,
      (SELECT option_text FROM options o2 WHERE o2.question_id = qs.id AND o2.is_correct = 1 LIMIT 1) AS correctOption
    FROM questions qs
    JOIN quizzes q ON qs.quiz_id = q.id
    JOIN teachers t ON q.teacher_id = t.id
    ${whereClause}
    ORDER BY q.title, qs.id
  `;

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error("Export teacher questions error:", err);
      return res.status(500).json({ error: "DB error (export teacher)" });
    }
    sendCsv(
      res,
      `teacher-${teacherId}-questions.csv`,
      rows || []
    );
  });
});
// Export questions for a specific quiz
app.get("/api/hod/export/quiz/:quizId", requireHod, (req, res) => {
  const quizId = req.params.quizId;

  const sql = `
    SELECT
      t.name AS teacherName,
      t.email AS teacherEmail,
      q.title AS quizTitle,
      q.created_at,
      qs.question_text,
      (SELECT option_text FROM options o2 WHERE o2.question_id = qs.id ORDER BY o2.id LIMIT 1 OFFSET 0) AS optionA,
      (SELECT option_text FROM options o2 WHERE o2.question_id = qs.id ORDER BY o2.id LIMIT 1 OFFSET 1) AS optionB,
      (SELECT option_text FROM options o2 WHERE o2.question_id = qs.id ORDER BY o2.id LIMIT 1 OFFSET 2) AS optionC,
      (SELECT option_text FROM options o2 WHERE o2.question_id = qs.id ORDER BY o2.id LIMIT 1 OFFSET 3) AS optionD,
      (SELECT option_text FROM options o2 WHERE o2.question_id = qs.id AND o2.is_correct = 1 LIMIT 1) AS correctOption
    FROM questions qs
    JOIN quizzes q ON qs.quiz_id = q.id
    JOIN teachers t ON q.teacher_id = t.id
    WHERE q.id = ?
    ORDER BY qs.id
  `;

  db.all(sql, [quizId], (err, rows) => {
    if (err) {
      console.error("Export quiz questions error:", err);
      return res.status(500).json({ error: "DB error (export quiz)" });
    }
    sendCsv(res, `quiz-${quizId}-questions.csv`, rows || []);
  });
});



// helper: require logged-in teacher
function requireTeacher(req, res, next) {
  if (!req.session.teacher) {
    return res.status(401).json({ error: "Not logged in" });
  }
  next();
}
// Simple HOD config (demo credentials)
// You can change these to whatever you like.
function requireHod(req, res, next) {
  if (!req.session || !req.session.hod) {
    return res.status(401).json({ error: "Not logged in as HOD" });
  }
  next();
}


// -------------------- AUTH ROUTES --------------------

// POST /api/auth/register
app.post("/api/auth/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const password_hash = bcrypt.hashSync(password, 10);

  db.run(
    "INSERT INTO teachers (name, email, password_hash) VALUES (?, ?, ?)",
    [name, email, password_hash],
    function (err) {
      if (err) {
        console.error("Error registering teacher:", err);
        return res
          .status(400)
          .json({ error: "Email already used or database error" });
      }
      req.session.teacher = { id: this.lastID, name, email };
      res.json({ success: true, teacher: req.session.teacher });
    }
  );
});

// POST /api/auth/login
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;

  db.get("SELECT * FROM teachers WHERE email = ?", [email], (err, row) => {
    if (err || !row) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const ok = bcrypt.compareSync(password, row.password_hash);
    if (!ok) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    req.session.teacher = { id: row.id, name: row.name, email: row.email };
    res.json({ success: true, teacher: req.session.teacher });
  });
});

// GET /api/auth/me
app.get("/api/auth/me", (req, res) => {
  if (!req.session.teacher) return res.json({ teacher: null });
  res.json({ teacher: req.session.teacher });
});

// POST /api/auth/logout
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});
// ---------- HOD AUTH ROUTES ----------

// POST /api/hod/login
// POST /api/hod/login
app.post("/api/hod/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Missing username or password" });
  }

  db.get(
    "SELECT * FROM hod_admin WHERE username = ?",
    [username],
    (err, row) => {
      if (err) {
        console.error("HOD login DB error:", err);
        return res.status(500).json({ error: "DB error" });
      }
      if (!row) {
        return res.status(400).json({ error: "Invalid HOD credentials" });
      }

      const ok = bcrypt.compareSync(password, row.password_hash);
      if (!ok) {
        return res.status(400).json({ error: "Invalid HOD credentials" });
      }

      req.session.hod = { id: row.id, username: row.username };
      return res.json({
        success: true,
        hod: { id: row.id, username: row.username }
      });
    }
  );
});


// GET /api/hod/me
app.get("/api/hod/me", (req, res) => {
  if (!req.session.hod) return res.json({ hod: null });
  res.json({ hod: req.session.hod });
});

// POST /api/hod/logout
app.post("/api/hod/logout", (req, res) => {
  delete req.session.hod;
  res.json({ success: true });
});
// POST /api/hod/change-password
// Body: { oldPassword, newPassword }
app.post("/api/hod/change-password", requireHod, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res
      .status(400)
      .json({ error: "Old password and new password are required" });
  }

  const hodId = req.session.hod.id;

  db.get(
    "SELECT * FROM hod_admin WHERE id = ?",
    [hodId],
    (err, row) => {
      if (err) {
        console.error("HOD change-password DB error:", err);
        return res.status(500).json({ error: "DB error" });
      }
      if (!row) {
        return res.status(404).json({ error: "HOD account not found" });
      }

      const ok = bcrypt.compareSync(oldPassword, row.password_hash);
      if (!ok) {
        return res.status(400).json({ error: "Old password is incorrect" });
      }

      const newHash = bcrypt.hashSync(newPassword, 10);
      db.run(
        "UPDATE hod_admin SET password_hash = ? WHERE id = ?",
        [newHash, hodId],
        (err2) => {
          if (err2) {
            console.error("Error updating HOD password:", err2);
            return res.status(500).json({ error: "DB error" });
          }
          return res.json({ success: true });
        }
      );
    }
  );
});

// -------------------- QUIZ CRUD (DB) --------------------

// Create quiz with questions and options
// POST /api/quizzes
// Create quiz with questions + options (FIXED)
app.post("/api/quizzes", requireTeacher, (req, res) => {
  const teacherId = req.session.teacher.id;
  const { title, questions } = req.body;

  if (!title || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: "Invalid quiz data" });
  }

  db.run(
    "INSERT INTO quizzes (teacher_id, title) VALUES (?, ?)",
    [teacherId, title],
    function (err) {
      if (err) {
        console.error("Error inserting quiz:", err);
        return res.status(500).json({ error: "DB error (quiz)" });
      }

      const quizId = this.lastID;

      let pending = questions.length;

      questions.forEach((q) => {
        db.run(
          "INSERT INTO questions (quiz_id, question_text) VALUES (?, ?)",
          [quizId, q.text],
          function (err) {
            if (err) {
              console.error("Error inserting question:", err);
              return finish();
            }

            const questionId = this.lastID;

            q.options.forEach((opt, index) => {
              const isCorrect = index === q.correctIndex ? 1 : 0;
              db.run(
                "INSERT INTO options (question_id, option_text, is_correct) VALUES (?, ?, ?)",
                [questionId, opt, isCorrect]
              );
            });

            finish();
          }
        );
      });

      function finish() {
        pending--;
        if (pending === 0) {
          console.log("Quiz saved successfully with full questions + options!");
          res.json({ success: true, quizId });
        }
      }
    }
  );
});


// Get all quizzes for logged-in teacher
// GET /api/quizzes
app.get("/api/quizzes", requireTeacher, (req, res) => {
  const teacherId = req.session.teacher.id;

  db.all(
    "SELECT id, title, created_at, pin FROM quizzes WHERE teacher_id = ? ORDER BY created_at DESC",
    [teacherId],
    (err, rows) => {
      if (err) {
        console.error("Error loading quizzes:", err);
        return res.status(500).json({ error: "DB error (quizzes)" });
      }
      res.json({ success: true, quizzes: rows });
    }
  );
});

// Get quiz details (with questions + options)
// GET /api/quizzes/:id
app.get("/api/quizzes/:id", requireTeacher, (req, res) => {
  const quizId = req.params.id;

  db.get("SELECT * FROM quizzes WHERE id = ?", [quizId], (err, quiz) => {
    if (err || !quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    db.all(
      "SELECT * FROM questions WHERE quiz_id = ?",
      [quizId],
      (err, questions) => {
        if (err) {
          console.error("Error loading questions:", err);
          return res.status(500).json({ error: "DB error (questions)" });
        }

        const qIds = questions.map((q) => q.id);
        if (qIds.length === 0) {
          return res.json({ success: true, quiz, questions: [] });
        }

        const placeholders = qIds.map(() => "?").join(",");
        db.all(
          `SELECT * FROM options WHERE question_id IN (${placeholders})`,
          qIds,
          (err, optionsRows) => {
            if (err) {
              console.error("Error loading options:", err);
              return res.status(500).json({ error: "DB error (options)" });
            }

            const questionData = questions.map((q) => {
              const opts = optionsRows.filter((o) => o.question_id === q.id);
              return {
                id: q.id,
                text: q.question_text,
                options: opts.map((o) => ({
                  id: o.id,
                  text: o.option_text,
                  is_correct: Number(o.is_correct) === 1
                }))
              };
            });

            res.json({ success: true, quiz, questions: questionData });
          }
        );
      }
    );
  });
});
// Update existing quiz (title + questions/options)
// PUT /api/quizzes/:id
app.put("/api/quizzes/:id", requireTeacher, (req, res) => {
  const quizId = req.params.id;
  const teacherId = req.session.teacher.id;
  const { title, questions } = req.body;

  if (!title || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: "Invalid quiz data" });
  }

  // Ensure quiz belongs to this teacher
  db.get(
    "SELECT id FROM quizzes WHERE id = ? AND teacher_id = ?",
    [quizId, teacherId],
    (err, row) => {
      if (err) {
        console.error("Error checking quiz owner:", err);
        return res.status(500).json({ error: "DB error" });
      }
      if (!row) {
        return res.status(404).json({ error: "Quiz not found" });
      }

      db.serialize(() => {
        // 1. Update title
        db.run(
          "UPDATE quizzes SET title = ? WHERE id = ?",
          [title, quizId],
          (err) => {
            if (err) {
              console.error("Error updating quiz title:", err);
              return res.status(500).json({ error: "DB error (update title)" });
            }
          }
        );

        // 2. Remove old questions + options
        db.run(
          "DELETE FROM options WHERE question_id IN (SELECT id FROM questions WHERE quiz_id = ?)",
          [quizId],
          (err) => {
            if (err) {
              console.error("Error deleting old options:", err);
              return res.status(500).json({ error: "DB error (delete options)" });
            }
          }
        );

        db.run(
          "DELETE FROM questions WHERE quiz_id = ?",
          [quizId],
          (err) => {
            if (err) {
              console.error("Error deleting old questions:", err);
              return res
                .status(500)
                .json({ error: "DB error (delete questions)" });
            }

            // 3. Insert new questions + options
            let pending = questions.length;

            questions.forEach((q) => {
              db.run(
                "INSERT INTO questions (quiz_id, question_text) VALUES (?, ?)",
                [quizId, q.text],
                function (err) {
                  if (err) {
                    console.error("Error inserting question:", err);
                    return finishWithError();
                  }

                  const questionId = this.lastID;
                  q.options.forEach((opt, index) => {
                    const isCorrect = index === q.correctIndex ? 1 : 0;
                    db.run(
                      "INSERT INTO options (question_id, option_text, is_correct) VALUES (?, ?, ?)",
                      [questionId, opt, isCorrect],
                      (err) => {
                        if (err) {
                          console.error("Error inserting option:", err);
                          // do not immediately send response multiple times
                        }
                      }
                    );
                  });

                  finish();
                }
              );
            });

            function finish() {
              pending--;
              if (pending === 0) {
                console.log("Quiz updated successfully:", quizId);
                return res.json({ success: true, quizId });
              }
            }

            function finishWithError() {
              // single error response; you could extend this
              if (pending > 0) {
                pending = 0;
                return res
                  .status(500)
                  .json({ error: "DB error while updating questions" });
              }
            }
          }
        );
      });
    }
  );
});
// Delete quiz (and its questions/options)
// DELETE /api/quizzes/:id
app.delete("/api/quizzes/:id", requireTeacher, (req, res) => {
  const quizId = req.params.id;
  const teacherId = req.session.teacher.id;

  // Ensure quiz belongs to this teacher
  db.get(
    "SELECT id FROM quizzes WHERE id = ? AND teacher_id = ?",
    [quizId, teacherId],
    (err, row) => {
      if (err) {
        console.error("Error checking quiz owner:", err);
        return res.status(500).json({ error: "DB error" });
      }
      if (!row) {
        return res.status(404).json({ error: "Quiz not found" });
      }

      db.serialize(() => {
        db.run(
          "DELETE FROM options WHERE question_id IN (SELECT id FROM questions WHERE quiz_id = ?)",
          [quizId],
          (err) => {
            if (err) {
              console.error("Error deleting options:", err);
              return res.status(500).json({ error: "DB error (delete options)" });
            }
          }
        );

        db.run(
          "DELETE FROM questions WHERE quiz_id = ?",
          [quizId],
          (err) => {
            if (err) {
              console.error("Error deleting questions:", err);
              return res
                .status(500)
                .json({ error: "DB error (delete questions)" });
            }
          }
        );

        db.run(
          "DELETE FROM quizzes WHERE id = ?",
          [quizId],
          (err) => {
            if (err) {
              console.error("Error deleting quiz:", err);
              return res.status(500).json({ error: "DB error (delete quiz)" });
            }
            console.log("Quiz deleted:", quizId);
            return res.json({ success: true });
          }
        );
      });
    }
  );
});
// -------------------- HOD DASHBOARD SUMMARY --------------------

// GET /api/hod/summary
// Returns summary of all teachers, quizzes, and questions
// -------------------- HOD DASHBOARD SUMMARY --------------------

// GET /api/hod/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&teacherId=ID
app.get("/api/hod/summary", requireHod, (req, res) => {
  const summary = {
    totalTeachers: 0,    // all-time
    totalQuizzes: 0,     // filtered by date/teacher
    totalQuestions: 0,   // filtered by date/teacher
    latestQuizzes: [],
    teacherStats: []
  };

  const { from, to, teacherId } = req.query;

  // Build WHERE for quiz-based queries
  const conditions = [];
  const params = [];

  if (from) {
    conditions.push("q.created_at >= ?");
    params.push(from + " 00:00:00");
  }
  if (to) {
    conditions.push("q.created_at <= ?");
    params.push(to + " 23:59:59");
  }
  if (teacherId) {
    conditions.push("q.teacher_id = ?");
    params.push(teacherId);
  }

  const whereClause = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

  // 1) total teachers (all-time, not filtered)
  db.get("SELECT COUNT(*) AS total FROM teachers", [], (err, row) => {
    if (err) {
      console.error("Error counting teachers:", err);
      return res.status(500).json({ error: "DB error (teachers)" });
    }
    summary.totalTeachers = row.total || 0;

    // 2) total quizzes (filtered)
    db.get(
      `SELECT COUNT(*) AS total FROM quizzes q ${whereClause}`,
      params,
      (err2, row2) => {
        if (err2) {
          console.error("Error counting quizzes:", err2);
          return res.status(500).json({ error: "DB error (quizzes)" });
        }
        summary.totalQuizzes = row2.total || 0;

        // 3) total questions (filtered)
        db.get(
          `SELECT COUNT(*) AS total
           FROM questions qs
           JOIN quizzes q ON qs.quiz_id = q.id
           ${whereClause}`,
          params,
          (err3, row3) => {
            if (err3) {
              console.error("Error counting questions:", err3);
              return res.status(500).json({ error: "DB error (questions)" });
            }
            summary.totalQuestions = row3.total || 0;

            // 4) latest quizzes (filtered, last 10)
            db.all(
              `
              SELECT
                q.id,
                q.title,
                q.created_at,
                t.name AS teacherName,
                t.email AS teacherEmail,
                (
                  SELECT COUNT(*) FROM questions qq WHERE qq.quiz_id = q.id
                ) AS questionCount
              FROM quizzes q
              JOIN teachers t ON t.id = q.teacher_id
              ${whereClause}
              ORDER BY q.created_at DESC
              LIMIT 10
            `,
              params,
              (err4, latestRows) => {
                if (err4) {
                  console.error("Error loading latest quizzes:", err4);
                  return res
                    .status(500)
                    .json({ error: "DB error (latest quizzes)" });
                }
                summary.latestQuizzes = latestRows || [];

                // 5) teacher stats (filtered)
                db.all(
                  `
                  SELECT
                    t.id,
                    t.name,
                    t.email,
                    COALESCE(qs.quizCount, 0) AS quizCount,
                    COALESCE(qs.questionCount, 0) AS questionCount
                  FROM teachers t
                  LEFT JOIN (
                    SELECT
                      q.teacher_id,
                      COUNT(DISTINCT q.id) AS quizCount,
                      COUNT(DISTINCT qs.id) AS questionCount
                    FROM quizzes q
                    LEFT JOIN questions qs ON qs.quiz_id = q.id
                    ${whereClause}
                    GROUP BY q.teacher_id
                  ) qs ON qs.teacher_id = t.id
                  ORDER BY quizCount DESC, questionCount DESC
                `,
                  params,
                  (err5, teacherRows) => {
                    if (err5) {
                      console.error("Error loading teacher stats:", err5);
                      return res
                        .status(500)
                        .json({ error: "DB error (teacher stats)" });
                    }

                    summary.teacherStats = teacherRows || [];
                    return res.json({ success: true, summary });
                  }
                );
              }
            );
          }
        );
      }
    );
  });
});
// List all teachers (for HOD filters)
app.get("/api/hod/teachers", requireHod, (req, res) => {
  db.all(
    "SELECT id, name, email FROM teachers ORDER BY name ASC",
    [],
    (err, rows) => {
      if (err) {
        console.error("Error loading teachers:", err);
        return res.status(500).json({ error: "DB error (teachers list)" });
      }
      res.json({ success: true, teachers: rows });
    }
  );
});




// -------------------- LIVE QUIZ (IN-MEMORY SESSIONS) --------------------

// pin -> { quizId, title, teacherId, questions, players, currentQuestionIndex }
const liveSessions = {};

// Helper: generate unique 4-digit PIN
function generatePin() {
  let pin;
  do {
    pin = Math.floor(1000 + Math.random() * 9000).toString();
  } while (liveSessions[pin]);
  return pin;
}

// Teacher starts live session for a quiz
// POST /api/quizzes/:id/start-live
app.post("/api/quizzes/:id/start-live", requireTeacher, (req, res) => {
  const quizId = req.params.id;
  const teacherId = req.session.teacher.id;

  // 1) load quiz (ensure it belongs to this teacher)
  db.get(
    "SELECT id, title, teacher_id FROM quizzes WHERE id = ? AND teacher_id = ?",
    [quizId, teacherId],
    (err, quiz) => {
      if (err || !quiz) {
        console.error("Error loading quiz:", err);
        return res.status(404).json({ error: "Quiz not found" });
      }

      // 2) load questions
      db.all(
        "SELECT id, question_text FROM questions WHERE quiz_id = ?",
        [quizId],
        (err, questions) => {
          if (err) {
            console.error("Error loading questions:", err);
            return res.status(500).json({ error: "DB error (questions)" });
          }

          if (!questions || questions.length === 0) {
            return res
              .status(400)
              .json({ error: "This quiz has no questions." });
          }

          const qIds = questions.map((q) => q.id);
          const placeholders = qIds.map(() => "?").join(",");

          // 3) load options for all those questions
          db.all(
            `SELECT id, question_id, option_text, is_correct
             FROM options
             WHERE question_id IN (${placeholders})`,
            qIds,
            (err, optionRows) => {
              if (err) {
                console.error("Error loading options:", err);
                return res.status(500).json({ error: "DB error (options)" });
              }

              console.log("Loaded options rows:", optionRows);

              // 4) build full questions array for live session
              const fullQuestions = questions.map((q) => {
                const opts = optionRows.filter(
                  (o) => o.question_id === q.id
                );
                const options = opts.map((o) => o.option_text);
                let correctIndex = opts.findIndex(
                  (o) => Number(o.is_correct) === 1
                );
                if (correctIndex < 0) correctIndex = 0;

                return {
                  id: q.id,
                  text: q.question_text,
                  options,
                  correctIndex
                };
              });

              console.log("Built fullQuestions:", fullQuestions);

              const pin = generatePin();
              liveSessions[pin] = {
                quizId: quiz.id,
                title: quiz.title,
                teacherId: quiz.teacher_id,
                questions: fullQuestions,
                players: {}, // socketId -> { name, score, answers:{} }
                currentQuestionIndex: null
              };

              // store PIN in DB (optional)
              db.run("UPDATE quizzes SET pin = ? WHERE id = ?", [pin, quiz.id]);

              res.json({
                success: true,
                pin,
                title: quiz.title
              });
            }
          );
        }
      );
    }
  );
});

// -------------------- SOCKET.IO EVENTS --------------------

io.on("connection", (socket) => {
  console.log("New client connected", socket.id);

  // STUDENT: join live quiz
    socket.on("joinLiveQuiz", (data, callback) => {
    const { pin, studentName } = data;
    const session = liveSessions[pin];
    if (!session) {
      if (callback) callback({ success: false, message: "Invalid PIN" });
      return;
    }

    // simple emoji avatar list
    const avatars = ["🦊", "🐼", "🐯", "🐸", "🐙", "🐵", "🐧", "🐨", "🐶", "🐱"];
    const avatar =
      avatars[Math.floor(Math.random() * avatars.length)] || "🙂";

    socket.join(`live-${pin}`);
    // Projector should NOT be added to scoreboard
if (studentName === "PROJECTOR") {
  if (callback)
    callback({
      success: true,
      quizTitle: session.title
    });
  return;
}

// Normal student
session.players[socket.id] = {
  name: studentName || "Student",
  score: 0,
  answers: {},
  avatar
};


    io.to(`live-${pin}`).emit("playerListUpdate", {
      players: Object.values(session.players).map((p) => ({
        name: p.name,
        score: p.score,
        avatar: p.avatar
      }))
    });

    if (callback) {
      callback({
        success: true,
        quizTitle: session.title,
        avatar
      });
    }
  });


  // TEACHER: join control room for a PIN
  socket.on("teacherJoinLive", (data, callback) => {
    const { pin } = data;
    const session = liveSessions[pin];
    if (!session) {
      if (callback) callback({ success: false, message: "Invalid PIN" });
      return;
    }
    socket.join(`live-${pin}`);
    if (callback) callback({ success: true, title: session.title });
  });

  // TEACHER: start question with timerSeconds
   // TEACHER: start question with timerSeconds
  socket.on("startQuestion", (data) => {
    const { pin, questionIndex, timerSeconds, totalQuestions } = data;
    const session = liveSessions[pin];
    if (!session) return;

    session.currentQuestionIndex = questionIndex;
  session.currentQuestionIndex = questionIndex;
  session.questionStartTime = Date.now();

    const question = session.questions[questionIndex];

    io.to(`live-${pin}`).emit("questionStarted", {
      questionIndex,
      question: {
        text: question.text,
        options: question.options
      },
      timerSeconds: timerSeconds || 20,
      totalQuestions: totalQuestions || session.questions.length
    });
  });


  // STUDENT: submit answer
  socket.on("submitAnswer", (data, callback) => {
  const { pin, questionIndex, optionIndex } = data;
  const session = liveSessions[pin];
  if (!session) {
    if (callback) callback({ success: false });
    return;
  }

  const player = session.players[socket.id];
  if (!player) {
    if (callback) callback({ success: false });
    return;
  }

  if (!player.answers) player.answers = {};
  if (!player.answerTimes) player.answerTimes = {};

  // Save the chosen option
  player.answers[questionIndex] = optionIndex;

  // Save time taken (ms) since question started
  const start = session.questionStartTime || Date.now();
  const elapsed = Date.now() - start;
  player.answerTimes[questionIndex] = elapsed;

  if (callback) callback({ success: true });
});



  // TEACHER: end question, show leaderboard
  socket.on("endQuestion", (data) => {
    const { pin } = data;
    const session = liveSessions[pin];
    if (!session) return;

    const qIndex = session.currentQuestionIndex;
    if (qIndex === null || qIndex === undefined) return;

    const question = session.questions[qIndex];
    const correctIndex = question.correctIndex;

   const answerStats = Array(question.options.length).fill(0);

Object.values(session.players).forEach((p) => {
  const ans = p.answers ? p.answers[qIndex] : null;
  if (ans !== null && ans !== undefined) {
    answerStats[ans]++;

    // Correct answer → add points and accumulate time
    if (ans === correctIndex) {
      p.score = (p.score || 0) + 100;

      const t =
        p.answerTimes && p.answerTimes[qIndex] != null
          ? p.answerTimes[qIndex]
          : null;

      if (t != null) {
        p.totalCorrectTimeMs = (p.totalCorrectTimeMs || 0) + t;
      }
    }
  }
});

// Ranking: higher score first; if tie, smaller totalCorrectTimeMs wins
const scoreboard = Object.values(session.players)
  .map((p) => ({
    name: p.name,
    score: p.score || 0,
    totalTimeMs: p.totalCorrectTimeMs || 0,
    avatar: p.avatar || "🙂"
  }))
  .sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.totalTimeMs - b.totalTimeMs;
  });

io.to(`live-${pin}`).emit("questionEnded", {
  questionIndex: qIndex,
  correctIndex,
  answerStats,
  scoreboard
});



    session.currentQuestionIndex = null;
  });

  // Disconnect cleanup
  socket.on("disconnect", () => {
    console.log("Client disconnected", socket.id);
    Object.keys(liveSessions).forEach((pin) => {
      const session = liveSessions[pin];
      if (session.players[socket.id]) {
        delete session.players[socket.id];
        io.to(`live-${pin}`).emit("playerListUpdate", {
          players: Object.values(session.players).map((p) => ({
            name: p.name,
            score: p.score
          }))
        });
      }
    });
  });
});

// -------------------- START SERVER --------------------
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
