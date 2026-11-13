const rateLimit = require("express-rate-limit").rateLimit;
require("dotenv").config();

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const bcrypt = require("bcryptjs");

const app = express();
const PORT = 3000;

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many attempts. Please try again later."
    }
});


// Middleware
app.use(express.json({ limit: "10kb" }));

if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

app.use(
    session({
        name: "banana.sid",
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
            mongoUrl: process.env.MONGODB_URI,
            collectionName: "sessions"
        }),
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 1000 * 60 * 60 * 24
        }
    })
);


// Redirect the website homepage to the login page
app.get("/", (req, res) => {
    res.redirect("/intro.html");
});

// Serve existing game files
app.use(express.static(__dirname, { dotfiles: "deny" }));

// User model
const userSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
            minlength: 3,
            maxlength: 20
        },
        passwordHash: {
            type: String,
            required: true
        },
        score: {
            type: Number,
            default: 0
        }
    },
    { timestamps: true }
);

const User = mongoose.model("User", userSchema);

// Authentication middleware
function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            message: "Please log in first."
        });
    }

    next();
}

// Health check
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "Banana Challenge server is running!"
    });
});
// Register
app.post("/api/auth/register", authLimiter, async (req, res) => {
    try {
        const username =
            typeof req.body.username === "string"
                ? req.body.username.trim().toLowerCase()
                : "";

        const password = req.body.password;

        if (!/^[a-z0-9_]{3,20}$/.test(username)) {
            return res.status(400).json({
                success: false,
                message: "Username must be 3-20 characters and contain only letters, numbers or underscores."
            });
        }

        if (
            typeof password !== "string" ||
            password.length < 8 ||
            password.length > 72
        ) {
            return res.status(400).json({
                success: false,
                message: "Password must be between 8 and 72 characters."
            });
        }

        const existingUser = await User.findOne({ username });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "This username is already taken."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const user = await User.create({
            username,
            passwordHash
        });

        return res.status(201).json({
            success: true,
            message: "Registration successful!",
            user: {
                id: user._id,
                username: user.username,
                score: user.score
            }
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "This username is already taken."
            });
        }

        console.error("Registration error:", error);

        return res.status(500).json({
            success: false,
            message: "Could not create your account."
        });
    }
});
// Login
app.post("/api/auth/login", authLimiter, async (req, res) => {    try {
        const username =
            typeof req.body.username === "string"
                ? req.body.username.trim().toLowerCase()
                : "";

        const password = req.body.password;

        if (!username || typeof password !== "string") {
            return res.status(400).json({
                success: false,
                message: "Enter your username and password."
            });
        }

        const user = await User.findOne({ username });

        if (
            !user ||
            !(await bcrypt.compare(password, user.passwordHash))
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password."
            });
        }

        req.session.regenerate((error) => {
            if (error) {
                console.error("Session regeneration error:", error);

                return res.status(500).json({
                    success: false,
                    message: "Could not start your session."
                });
            }

            req.session.userId = user._id.toString();

            req.session.save((saveError) => {
                if (saveError) {
                    console.error("Login session save error:", saveError);

                    return res.status(500).json({
                        success: false,
                        message: "Could not save your login session."
                    });
                }

                return res.json({
                    success: true,
                    message: "Login successful!",
                    user: {
                        id: user._id,
                        username: user.username,
                        score: user.score
                    }
                });
            });
        });

    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            success: false,
            message: "Could not log in. Please try again."
        });
    }
});

// Check login status
app.get("/api/auth/me", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Not logged in."
            });
        }

        const user = await User.findById(req.session.userId)
            .select("username score");

        if (!user) {
            return req.session.destroy(() => {
                res.status(401).json({
                    success: false,
                    message: "Please log in again."
                });
            });
        }

        res.json({
            success: true,
            user: {
                id: user._id,
                username: user.username,
                score: user.score
            }
        });
    } catch (error) {
        console.error("Session check error:", error.message);

        res.status(500).json({
            success: false,
            message: "Could not check login status."
        });
    }
});
// Start a new game with server-side progress tracking
app.post("/api/game/start", requireLogin, async (req, res) => {
    try {
        const { level } = req.body;

        const allowedLevels = ["Easy", "Medium", "Hard"];

        if (!allowedLevels.includes(level)) {
            return res.status(400).json({
                success: false,
                message: "Invalid game level."
            });
        }

        req.session.activeGame = {
            level: level,
            nextStage: 1,
            scoredStages: [],
            completed: false
        };

        req.session.hintSolution = null;

        req.session.save((error) => {
            if (error) {
                return res.status(500).json({
                    success: false,
                    message: "Could not start the game."
                });
            }

            res.json({
                success: true,
                message: "New game started!",
                level: level,
                stage: 1
            });
        });

    } catch (error) {
        console.error("Game start error:", error.message);

        res.status(500).json({
            success: false,
            message: "Could not start the game."
        });
    }
});

//NEW: Leaderboard API route
app.get("/api/leaderboard", async (req, res) => {
    try {
        const users = await User.find({})
            .select("username score")
            .sort({ score: -1, username: 1 })
            .limit(10)
            .lean();

        res.json({
            success: true,
            leaderboard: users.map((user, index) => ({
                rank: index + 1,
                username: user.username,
                score: user.score
            }))
        });
    } catch (error) {
        console.error("Leaderboard error:", error.message);

        res.status(500).json({
            success: false,
            message: "Could not load the leaderboard."
        });
    }
});


// Logout
app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            return res.status(500).json({
                success: false,
                message: "Could not log out."
            });
        }

        res.clearCookie("banana.sid");

        res.json({
            success: true,
            message: "Logged out successfully."
        });
    });
});


// ======================================
// BANANA API - HINT PUZZLE
// ======================================

// Load a Banana API puzzle for a hint
app.get("/api/hint/puzzle", requireLogin, async (req, res) => {
    try {
        const response = await fetch(
            "https://marcconrad.com/uob/banana/api.php?out=json"
        );

        if (!response.ok) {
            throw new Error("Banana API request failed");
        }

        const data = await response.json();

        if (
            !data.question ||
            data.solution === undefined ||
            !Number.isFinite(Number(data.solution))
        ) {
            throw new Error("Invalid Banana API response");
        }

        // Store the hint answer in the player's session
        req.session.hintSolution = Number(data.solution);

        res.json({
            success: true,
            question: data.question
        });

    } catch (error) {
        console.error("Banana Hint API error:", error.message);

        res.status(502).json({
            success: false,
            message: "Could not load the hint puzzle."
        });
    }
});

// Check Banana API hint answer
app.post("/api/hint/answer", requireLogin, (req, res) => {

    const solution = req.session.hintSolution;
    const { answer } = req.body;

    if (solution === undefined || solution === null) {
        return res.status(400).json({
            success: false,
            message: "Please load a hint puzzle first."
        });
    }

    if (
        answer === undefined ||
        answer === null ||
        String(answer).trim() === "" ||
        !Number.isFinite(Number(answer))
    ) {
        return res.status(400).json({
            success: false,
            message: "Please enter a valid number."
        });
    }

    const correct = Number(answer) === Number(solution);

    if (correct) {
        req.session.hintSolution = null;
    }

    req.session.save((error) => {

        if (error) {
            console.error("Hint session save error:", error);

            return res.status(500).json({
                success: false,
                message: "Could not save your answer. Please try again."
            });
        }

        return res.json({
            success: true,
            correct: correct,
            message: correct
                ? "🎉 Hint Unlocked!"
                : "❌ Incorrect answer. Try again!"
        });

    });
});

// ======================================
// MISSING LETTERS GAME ANSWER
// ======================================

// Server-side questions: answers are not taken from the browser
const gameQuestions = {
    Easy: [
        { word: "CAT", missing: [1] },
        { word: "BOOK", missing: [2] },
        { word: "FISH", missing: [1] }
    ],

    Medium: [
        { word: "APPLE", missing: [1, 3] },
        { word: "ORANGE", missing: [2, 4] },
        { word: "BANANA", missing: [1, 4] }
    ],

    Hard: [
        { word: "ELEPHANT", missing: [1, 4, 6] },
        { word: "COMPUTER", missing: [2, 4, 6] },
        { word: "NOTEBOOK", missing: [1, 3, 6] }
    ]
};

// Validate answers and control game progression
app.post("/api/game/answer", requireLogin, async (req, res) => {
    try {
        const { level, stage, answer } = req.body;

        // Validate request data
        if (
            typeof level !== "string" ||
            !gameQuestions[level] ||
            !Number.isInteger(stage) ||
            stage < 1 ||
            stage > 3 ||
            typeof answer !== "string" ||
            answer.length > 10
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid game answer request."
            });
        }

        // Check whether a game is active
        const game = req.session.activeGame;

        if (!game || game.completed) {
            return res.status(403).json({
                success: false,
                message: "Please start a new game."
            });
        }

        // Validate level and stage order
        if (
            level !== game.level ||
            stage !== game.nextStage
        ) {
            return res.status(403).json({
                success: false,
                message: "Invalid game progression."
            });
        }

        const question = gameQuestions[level][stage - 1];

        const correctAnswer = question.missing
            .map(index => question.word[index])
            .join("");

        const submittedAnswer = answer.trim().toUpperCase();

        // Check answer
        if (submittedAnswer !== correctAnswer) {
            return res.json({
                success: true,
                correct: false,
                pointsEarned: 0
            });
        }

        const stageKey = `${level}-${stage}`;

        // Prevent duplicate scoring
        if (game.scoredStages.includes(stageKey)) {
            return res.status(409).json({
                success: false,
                message: "This stage has already been scored."
            });
        }

        // Award points
        const user = await User.findByIdAndUpdate(
            req.session.userId,
            { $inc: { score: 10 } },
            { new: true, runValidators: true }
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User account not found."
            });
        }

        // Update server-side game progress
        game.scoredStages.push(stageKey);

        if (stage < 3) {
            game.nextStage = stage + 1;
        } else {
            game.completed = true;
        }

        req.session.activeGame = game;

        req.session.save((error) => {
            if (error) {
                console.error("Game session save error:", error);

                return res.status(500).json({
                    success: false,
                    message: "Could not save game progress."
                });
            }

            res.json({
                success: true,
                correct: true,
                pointsEarned: 10,
                score: user.score,
                nextStage: game.nextStage,
                completed: game.completed
            });
        });

    } catch (error) {
        console.error("Game answer error:", error.message);

        res.status(500).json({
            success: false,
            message: "Could not check the answer."
        });
    }
});


// Check the player's answer

app.post("/api/answer", requireLogin, async (req, res) => {
    const { answer } = req.body;
    const solution = req.session.currentSolution;

    if (solution === undefined || solution === null) {
        return res.status(400).json({
            success: false,
            message: "Please load a puzzle first."
        });
    }

    if (
        answer === undefined ||
        answer === null ||
        String(answer).trim() === "" ||
        !Number.isFinite(Number(answer))
    ) {
        return res.status(400).json({
            success: false,
            message: "Please enter a valid number."
        });
    }

    const correct = Number(answer) === Number(solution);

    // Prevent the same puzzle from being answered repeatedly
    req.session.currentSolution = null;

    try {
        let pointsEarned = 0;
        let newScore = null;

        if (correct) {
            pointsEarned = 10;

            const user = await User.findByIdAndUpdate(
                req.session.userId,
                { $inc: { score: pointsEarned } },
                { new: true, runValidators: true }
            );

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: "User account not found. Please log in again."
                });
            }

            newScore = user.score;
        }

        res.json({
            success: true,
            correct,
            pointsEarned,
            score: newScore
        });
    } catch (error) {
        console.error("Answer/score error:", error.message);

        res.status(500).json({
            success: false,
            message: "Could not save your score. Please try again."
        });
    }
});

// Connect to MongoDB before starting the server
async function startServer() {
    try {
        if (!process.env.MONGODB_URI || !process.env.SESSION_SECRET) {
            throw new Error(
                "MONGODB_URI and SESSION_SECRET must be set in .env"
            );
        }

        await mongoose.connect(process.env.MONGODB_URI);

        console.log("MongoDB connected successfully!");

        app.listen(PORT, () => {
            console.log(
                `Banana Challenge running at http://localhost:${PORT}`
            );
        });
    } catch (error) {
        console.error("Server startup failed:", error.message);
        process.exit(1);
    }
}

startServer();

