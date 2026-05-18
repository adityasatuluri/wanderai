const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { get, run, raw: db } = require("../db");

const router = express.Router();

// ✅ REGISTER
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, place, goal } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ msg: "Name, email and password are required." });
    }

    // Strong password check - match Flask requirements
    const strongPassword = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;

    if (!strongPassword.test(password)) {
      return res.status(400).json({
        msg: "Password must contain uppercase, lowercase, number, special char"
      });
    }

    const userExist = await get("SELECT * FROM users WHERE email = ?", [email.toLowerCase()]);
    if (userExist) return res.status(409).json({ msg: "Email already registered." });

    const hashed = await bcrypt.hash(password, 12);

    // Use 'name' field (mapped to username column for compatibility)
    const userPlace = place || 'London';
    const userGoal = goal || 'Nature';
    
    await run(
      "INSERT INTO users (username, email, password, place, goal) VALUES (?, ?, ?, ?, ?)",
      [name, email.toLowerCase(), hashed, userPlace, userGoal]
    );

    const user = await get("SELECT * FROM users WHERE email = ?", [email.toLowerCase()]);

    // Use email in JWT payload to match Flask
    const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({
      msg: "Registered successfully.",
      token,
      user: {
        name: user.username,
        email: user.email,
        place: user.place,
        goal: user.goal
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ✅ LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ msg: "Email and password are required." });
    }

    const user = await get("SELECT * FROM users WHERE email = ?", [email.toLowerCase()]);
    if (!user) return res.status(401).json({ msg: "No account found with this email." });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ msg: "Wrong password. Please try again." });

    // Use email in JWT payload to match Flask
    const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.json({
      msg: "Login successful.",
      token,
      user: {
        name: user.username,
        email: user.email,
        place: user.place,
        goal: user.goal
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ✅ SEND OTP
router.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await get("SELECT * FROM users WHERE email = ?", [email]);
    if (!user) return res.status(400).json({ msg: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await run("UPDATE users SET otp = ?, otpExpire = ? WHERE id = ?", [otp, Date.now() + 5 * 60 * 1000, user.id]);

    // Demo OTP (no real email)
    console.log(`Demo OTP for ${email}: ${otp}`);

    res.json({ msg: `OTP sent to ${email}: ${otp} (demo - check console)` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ✅ VERIFY OTP
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await get("SELECT * FROM users WHERE email = ?", [email.toLowerCase()]);

    if (!user || user.otp !== otp)
      return res.status(400).json({ msg: "Invalid OTP" });

    if (user.otpExpire < Date.now())
      return res.status(400).json({ msg: "OTP expired" });

    // Generate token for OTP login
    const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.json({
      msg: "OTP verified",
      token,
      user: {
        name: user.username,
        email: user.email,
        place: user.place,
        goal: user.goal
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ✅ RESET PASSWORD
router.post("/reset-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    // Strong password check
    const strongPassword = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&]).{6,}$/;
    if (!strongPassword.test(newPassword)) {
      return res.status(400).json({
        msg: "Password must contain uppercase, lowercase, number, special char"
      });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await run("UPDATE users SET password = ?, otp = NULL, otpExpire = NULL WHERE email = ?", [hashed, email]);

    res.json({ msg: "Password updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
