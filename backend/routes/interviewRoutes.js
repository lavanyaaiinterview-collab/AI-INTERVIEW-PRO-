const express = require("express");
const router = express.Router();

router.get("/questions", (req, res) => {
  res.json([
    "Tell me about yourself",
    "What are your strengths?",
    "Why should we hire you?"
  ]);
});

module.exports = router;