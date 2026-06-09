const express = require("express");
const app = express();

// middleware
app.use(express.json());

// Firebase Admin
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

console.log("Firebase Admin Connected");

// test route
app.get("/", (req, res) => {
  res.send("Backend is working");
});

// start server
app.listen(5000, () => {
  console.log("Server running on port 5000");
});


app.post("/api/verify-user", async (req, res) => { 
  // Creates a POST API endpoint called /api/verify-user
  // Frontend will send login token here to verify user

  try {
    const { idToken } = req.body;
    // Extracts Firebase login token sent from frontend

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    // Firebase Admin verifies if token is valid
    // If valid → returns user information (UID, email, etc.)

    res.json({
      success: true,
      user: decodedToken
    });
    // Sends success response + user data back to frontend

  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Invalid token"
    });
    // If token is wrong/expired → reject request
  }
});