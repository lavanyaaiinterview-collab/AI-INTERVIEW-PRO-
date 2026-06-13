const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();

// ===== MIDDLEWARE =====
app.use(cors());           // allows frontend to call this backend
app.use(express.json());   // allows server to read JSON sent from frontend

// ===== FIREBASE ADMIN SETUP =====
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore(); // this lets us read/write Firestore database

console.log("Firebase Admin Connected");

// ===== TEST ROUTE =====
app.get("/", (req, res) => {
  res.send("Backend is working");
});

// =================================================
// 1. VERIFY USER (Login check)
// =================================================
app.post("/api/verify-user", async (req, res) => {
  try {
    const { idToken } = req.body;
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    res.json({
      success: true,
      user: decodedToken
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Invalid token"
    });
  }
});

// =================================================
// 2. REGISTER USER (save user info in Firestore after signup)
// =================================================
app.post("/api/register", async (req, res) => {
  try {
    const { uid, name, email, photo } = req.body;
    // uid comes from Firebase Auth after frontend signup

    await db.collection("users").doc(uid).set({
      name: name || "",
      email: email,
      photo: photo || "",
      createdAt: new Date()
    });

    res.json({ success: true, message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =================================================
// 3. GET SUBJECTS (list of interview subjects)
// =================================================
app.get("/api/subjects", async (req, res) => {
  try {
    const snapshot = await db.collection("subjects").get();
    const subjects = [];

    snapshot.forEach(doc => {
      subjects.push({ id: doc.id, ...doc.data() });
    });

    res.json({ success: true, subjects });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =================================================
// 4. START INTERVIEW (create a new session)
// =================================================
app.post("/api/start-interview", async (req, res) => {
  try {
    const { uid, subject } = req.body;

    const sessionRef = await db.collection("sessions").add({
      user_id: uid,
      subject: subject,
      answers: [],
      violations: [],
      total_score: 0,
      status: "in-progress",
      createdAt: new Date()
    });

    res.json({
      success: true,
      session_id: sessionRef.id,
      message: "Interview session started"
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =================================================
// 5. GENERATE QUESTION (using Claude API)
// =================================================
app.post("/api/generate-question", async (req, res) => {
  try {
    const { subject, difficulty } = req.body;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: `Generate one ${difficulty || "medium"} level interview question for the subject: ${subject}. Only return the question text, nothing else.`
          }
        ]
      })
    });

    const data = await response.json();
    const question = data.content[0].text;

    res.json({ success: true, question });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =================================================
// 6. SUBMIT ANSWER (score + feedback using Claude)
// =================================================
app.post("/api/submit-answer", async (req, res) => {
  try {
    const { session_id, question, answer } = req.body;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: `Question: ${question}\nAnswer: ${answer}\n\nGive a score out of 10 and short feedback (2 lines). Respond ONLY in JSON format like: {"score": 7, "feedback": "..."}`
          }
        ]
      })
    });

    const data = await response.json();
    const result = JSON.parse(data.content[0].text);

    // Save this answer inside the session document
    const sessionRef = db.collection("sessions").doc(session_id);
    await sessionRef.update({
      answers: admin.firestore.FieldValue.arrayUnion({
        question,
        answer,
        score: result.score,
        feedback: result.feedback
      })
    });

    res.json({ success: true, score: result.score, feedback: result.feedback });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =================================================
// 7. SAVE / END SESSION (calculate total score)
// =================================================
app.post("/api/save-session", async (req, res) => {
  try {
    const { session_id } = req.body;

    const sessionDoc = await db.collection("sessions").doc(session_id).get();
    const sessionData = sessionDoc.data();

    let total = 0;
    sessionData.answers.forEach(a => total += a.score);
    const avgScore = sessionData.answers.length ? total / sessionData.answers.length : 0;

    await db.collection("sessions").doc(session_id).update({
      total_score: avgScore,
      status: "completed",
      completedAt: new Date()
    });

    res.json({ success: true, total_score: avgScore });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =================================================
// 8. DASHBOARD (get all sessions for a user)
// =================================================
app.get("/api/dashboard/:uid", async (req, res) => {
  try {
    const { uid } = req.params;

    const snapshot = await db.collection("sessions")
      .where("user_id", "==", uid)
      .get();

    const sessions = [];
    snapshot.forEach(doc => sessions.push({ id: doc.id, ...doc.data() }));

    res.json({ success: true, sessions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =================================================
// 9. ADMIN - ADD QUESTION (optional, for admin panel)
// =================================================
app.post("/api/admin/add-question", async (req, res) => {
  try {
    const { subject, question_text, difficulty } = req.body;

    await db.collection("questions").add({
      subject, question_text, difficulty
    });

    res.json({ success: true, message: "Question added" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =================================================
// 10. LOG PROCTORING VIOLATION
// =================================================
app.post("/api/log-violation", async (req, res) => {
  try {
    const { session_id, type } = req.body;

    const sessionRef = db.collection("sessions").doc(session_id);

    await sessionRef.update({
      violations: admin.firestore.FieldValue.arrayUnion({
        type: type,
        time: new Date().toISOString()
      })
    });

    res.json({
      success: true,
      message: "Violation logged"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ===== START SERVER (always at the end of file) =====
app.listen(5000, () => {
  console.log("Server running on port 5000");
});


