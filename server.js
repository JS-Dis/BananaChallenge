
const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(express.json());

// Serve the game files
app.use(express.static(__dirname));

// Keep the correct answer on the server
let currentSolution = null;

// Check whether the server is running
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "Banana Challenge server is running!"
    });
});

// Get a puzzle from the Banana API
app.get("/api/puzzle", async (req, res) => {
    try {
        const response = await fetch(
            "https://marcconrad.com/uob/banana/api.php?out=json"
        );

        if (!response.ok) {
            throw new Error("Banana API request failed");
        }

        const data = await response.json();

        if (!data.question || data.solution === undefined) {
            throw new Error("Invalid puzzle data received");
        }

        currentSolution = Number(data.solution);

        // Send the image URL, but not the correct answer
        res.json({
            success: true,
            question: data.question
        });
    } catch (error) {
        console.error("Banana API error:", error.message);

        res.status(502).json({
            success: false,
            message: "Could not load a puzzle. Please try again."
        });
    }
});

// Check the player's answer on the server
app.post("/api/answer", (req, res) => {
    const { answer } = req.body;

    if (currentSolution === null) {
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

    const correct = Number(answer) === currentSolution;

    res.json({
        success: true,
        correct
    });

    // Prevent the same puzzle answer from being reused
    if (correct) {
        currentSolution = null;
    }
});

app.listen(PORT, () => {
    console.log(
        `Banana Challenge running at http://localhost:${PORT}`
    );
});
