
// ======================================
// BANANA CHALLENGE - MAIN GAME
// ======================================

// Player authentication
async function checkLogin() {
    try {
        const response = await fetch("/api/auth/me");
        const data = await response.json();

        if (!data.success) {
            window.location.href = "/login.html";
            return;
        }

        document.getElementById("username").textContent =
    data.user?.username || "Player";

    } catch (error) {
        console.error("Login check error:", error);
        window.location.href = "/login.html";
    }
}


// Logout
document.getElementById("logout-btn").addEventListener("click", async () => {
    try {
        await fetch("/api/auth/logout", {
            method: "POST"
        });

        window.location.href = "/login.html";

    } catch (error) {
        console.error("Logout error:", error);
    }
});


// ======================================
// GAME DATA
// ======================================

const questions = {
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

const levels = ["Easy", "Medium", "Hard"];


// ======================================
// GAME VARIABLES
// ======================================

let score = 0;
let lives = 3;
let timeLeft = 30;

let currentLevel = 0;
let currentStage = 0;

let currentQuestion = null;
let selectedLetters = [];

let timer = null;
let gameRunning = false;
let hintUsed = false;

let completedQuestions = 0;


// ======================================
// HTML ELEMENTS
// ======================================

const scoreElement = document.getElementById("score");
const livesElement = document.getElementById("lives");
const timerElement = document.getElementById("timer");

const levelElement = document.getElementById("level");
const stageElement = document.getElementById("stage");
const messageElement = document.getElementById("message");

const puzzleElement = document.getElementById("puzzle");
const selectedElement = document.getElementById("selected-letters");
const optionsElement = document.getElementById("letter-options");

const startButton = document.getElementById("start-btn");
const submitButton = document.getElementById("submit-btn");
const hintButton = document.getElementById("hint-btn");

const resultSection = document.getElementById("result-section");


// ======================================
// UPDATE DISPLAY
// ======================================


function updateDisplay() {
    scoreElement.textContent = score;
    livesElement.textContent = lives;
    timerElement.textContent = timeLeft;

    levelElement.textContent = levels[currentLevel] + " Level";
    stageElement.textContent = `Stage ${currentStage + 1} of 3`;
}


// ======================================
// START GAME

async function startGame(resume = false) {
    try {
        // Only start a new backend game when this is NOT a retry

    if (!resume) {
        const selectedLevel =
            sessionStorage.getItem("selectedLevel") || "Easy";

        currentLevel = levels.indexOf(selectedLevel);

        if (currentLevel === -1) currentLevel = 0;

        const response = await fetch("/api/game/start", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                level: levels[currentLevel]
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Could not start game.");
        }

        score = 0;
        completedQuestions = 0;
        currentStage = 0;
        lives = 3;
    }
 else {
            // Restore the same game after clicking Try Again
            score = Number(sessionStorage.getItem("retryScore") || 0);
            lives = Number(sessionStorage.getItem("retryLives") || 3);
            currentLevel = Number(sessionStorage.getItem("retryLevel") || 0);
            currentStage = Number(sessionStorage.getItem("retryStage") || 0);
            completedQuestions = Number(
                sessionStorage.getItem("retryCompletedQuestions") || 0
            );

            sessionStorage.setItem(
                "selectedLevel",
                levels[currentLevel]
            );
        }

        document.getElementById("start-screen").style.display = "none";
        document.getElementById("game-screen").style.display = "block";

        timeLeft = 30;

        startStage();

    } catch (error) {
        console.error("Game start error:", error);
        alert(error.message || "Unable to start the game.");
    }
}


// ======================================
// START STAGE
// ======================================


function startStage() {
    clearInterval(timer);

    timeLeft = 30;

    hintUsed = false;
    selectedLetters = [];

    currentQuestion =
        questions[levels[currentLevel]][currentStage];

    gameRunning = true;

    resultSection.hidden = true;

    updateDisplay();
    displayQuestion();
    startTimer();

    messageElement.textContent = "Find the missing letters!";
}



// ======================================
// DISPLAY QUESTION
// ======================================

function displayQuestion() {
    const word = currentQuestion.word;
    const missing = currentQuestion.missing;

    puzzleElement.innerHTML = "";

    for (let i = 0; i < word.length; i++) {
        const letter = document.createElement("span");

        if (missing.includes(i)) {
            letter.textContent = "_";
            letter.classList.add("missing-letter");
            letter.dataset.missingIndex = i;
        } else {
            letter.textContent = word[i];
        }

        puzzleElement.appendChild(letter);
    }

    selectedElement.innerHTML =
        "<p>Select the missing letters in order</p>";

    optionsElement.innerHTML = "";

    const correctLetters = missing.map(index => word[index]);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

    let options = [...correctLetters];

    while (options.length < 8) {
        const randomLetter =
            alphabet[Math.floor(Math.random() * alphabet.length)];

        if (!options.includes(randomLetter)) {
            options.push(randomLetter);
        }
    }

    options.sort(() => Math.random() - 0.5);

    options.forEach(letter => {
        const button = document.createElement("button");

        button.textContent = letter;
        button.className = "letter-option";

        button.addEventListener("click", () => {
            selectLetter(letter, button);
        });

        optionsElement.appendChild(button);
    });

    submitButton.disabled = true;
    hintButton.disabled = false;
}


// ======================================
// SELECT LETTER
// ======================================


function selectLetter(letter, button) {
    if (!gameRunning) return;

    const requiredLetters = currentQuestion.missing.length;

    if (selectedLetters.length >= requiredLetters) return;

    const missingIndex =
        currentQuestion.missing[selectedLetters.length];

    selectedLetters.push(letter);

    button.disabled = true;

    // Fill the exact missing position in the word
    const emptySlot = puzzleElement.querySelector(
        `[data-missing-index="${missingIndex}"]`
    );

    if (emptySlot) {
        emptySlot.textContent = letter;
        emptySlot.classList.add("filled");
    }

    selectedElement.textContent =
        "Selected: " + selectedLetters.join(" ");

    if (selectedLetters.length === requiredLetters) {
        submitButton.disabled = false;
    }
}



async function checkAnswer() {

    if (!gameRunning) return;

    const answer = selectedLetters.join("");

    try {
        const response = await fetch("/api/game/answer", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                level: levels[currentLevel],
                stage: currentStage + 1,
                answer: answer
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            messageElement.textContent =
                data.message || "Could not check your answer.";
            return;
        }

        if (data.correct) {

            clearInterval(timer);
            gameRunning = false;

            if (!data.alreadyScored) {
                score += data.pointsEarned;
            }

            completedQuestions++;

            updateDisplay();

            messageElement.textContent =
                data.alreadyScored
                    ? "Correct Answer!"
                    : "🎉 Correct Answer! +10 Points";

            setTimeout(nextStage, 1200);

        } else {
            loseLife("❌ Wrong answer!");
        }

    } catch (error) {
        console.error("Answer checking error:", error);

        messageElement.textContent =
            "Server error. Please try again.";
    }
}



// ======================================
// TIMER and LOSE LIVES
// ======================================


function saveRetryState() {
    sessionStorage.setItem("retryScore", score);
    sessionStorage.setItem("retryLives", lives);
    sessionStorage.setItem("retryLevel", currentLevel);
    sessionStorage.setItem("retryStage", currentStage);
    sessionStorage.setItem(
        "retryCompletedQuestions",
        completedQuestions
    );
    sessionStorage.setItem("selectedLevel", levels[currentLevel]);
}

function startTimer() {
    clearInterval(timer);

    timer = setInterval(() => {
        if (!gameRunning) {
            clearInterval(timer);
            return;
        }

        timeLeft--;

        if (timeLeft <= 0) {
            loseLife("time");
            return;
        }

        updateDisplay();

    }, 1000);
}

function loseLife(reason) {
    if (!gameRunning) return;

    clearInterval(timer);
    gameRunning = false;

    lives = Math.max(0, lives - 1);

    updateDisplay();

    saveRetryState();

    sessionStorage.setItem("lossReason", reason);

    if (lives <= 0) {
        window.location.href = "/game-over.html";
    } else {
        window.location.href = "/lost.html";
    }
}


// ======================================
// NEXT STAGE
// ======================================



function nextStage() {

    clearInterval(timer);
    gameRunning = false;

    if (currentStage < 2) {

        currentStage++;
        startStage();

    } else {

        // Current level completed
        const completedLevel = levels[currentLevel];

        // Find next level
        const nextLevelIndex = currentLevel + 1;

        sessionStorage.setItem("completedLevel", completedLevel);

        if (nextLevelIndex < levels.length) {

            sessionStorage.setItem(
                "nextLevel",
                levels[nextLevelIndex]
            );

        } else {

            sessionStorage.setItem("nextLevel", "Finished");

        }

        // Go to separate completion page
        window.location.href = "/level-complete.html";
    }
}



// ======================================
// SHOW RESULT
// ======================================
function showResult(title, message, type) {

    resultSection.hidden = false;

    document.getElementById("result-title").textContent = title;
    document.getElementById("result-message").textContent = message;

    document.getElementById("retry-btn").hidden =
        type !== "retry";

    document.getElementById("next-btn").hidden =
        type !== "next";

    document.getElementById("dashboard-btn").hidden =
        type !== "complete";

    document.getElementById("leaderboard-btn").hidden =
        type !== "complete";

    submitButton.disabled = true;
    hintButton.disabled = true;
}

// ======================================
// RETRY STAGE
// ======================================

document.getElementById("retry-btn").addEventListener("click", () => {
    startStage();
});

// ======================================
// BACK TO DASHBOARD
// ======================================

document.getElementById("dashboard-btn").addEventListener("click", () => {
    window.location.href = "/dashboard.html";
});


// ======================================
// BANANA API HINT
// ======================================

// ======================================
// BANANA API HINT
// ======================================

async function getHint() {

    if (!gameRunning || hintUsed) return;

    hintButton.disabled = true;

    try {
        const response = await fetch("/api/hint/puzzle");
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Could not load hint puzzle.");
        }

        // Pause main game timer
        clearInterval(timer);

        puzzleElement.innerHTML = "";

        const image = document.createElement("img");
        image.src = data.question;
        image.alt = "Banana API Puzzle";
        image.style.maxWidth = "100%";
        image.style.maxHeight = "250px";

        puzzleElement.appendChild(image);

        selectedElement.innerHTML = "";

        const answerInput = document.createElement("input");
        answerInput.type = "number";
        answerInput.id = "hint-answer";
        answerInput.placeholder = "Enter your answer";

        const answerButton = document.createElement("button");
        answerButton.type = "button";
        answerButton.textContent = "Check Answer";

        // Feedback message directly below the input
        const feedback = document.createElement("p");
        feedback.id = "hint-feedback";
        feedback.style.marginTop = "12px";
        feedback.style.fontWeight = "900";
        feedback.style.textAlign = "center";

        selectedElement.appendChild(answerInput);
        selectedElement.appendChild(answerButton);
        selectedElement.appendChild(feedback);

        answerButton.addEventListener("click", async () => {

            if (answerInput.value.trim() === "") {
                feedback.textContent = "Please enter your answer.";
                return;
            }

            answerButton.disabled = true;
            feedback.textContent = "Checking your answer...";

            try {
                const answerResponse = await fetch("/api/hint/answer", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        answer: answerInput.value
                    })
                });

                const answerData = await answerResponse.json();

                if (!answerResponse.ok) {
                    throw new Error(
                        answerData.message || "Unable to check answer."
                    );
                }

                if (answerData.correct === true) {

                    hintUsed = true;

                    feedback.textContent = "🎉 Hint Unlocked!";

                    const word = currentQuestion.word;
                    const hintLetters = currentQuestion.missing
                        .map(index => word[index])
                        .join(", ");

                    // Restore original game question
                    displayQuestion();

                    // Display unlocked hint
                    selectedElement.innerHTML =
                        "<p>💡 Hint: " + hintLetters + "</p>";

                    hintButton.disabled = true;

                    // Resume main game timer
                    startTimer();

                } else {

                    feedback.textContent =
                        answerData.message ||
                        "❌ Incorrect answer. Try again!";

                    answerInput.value = "";
                    answerButton.disabled = false;
                    answerInput.focus();
                }

            } catch (error) {

                console.error("Hint answer error:", error);

                feedback.textContent =
                    error.message || "Unable to check answer.";

                answerButton.disabled = false;
            }
        });

        answerInput.focus();

    } catch (error) {

        console.error("Hint loading error:", error);

        messageElement.textContent =
            error.message || "Could not load hint puzzle.";

        hintButton.disabled = false;

        if (gameRunning) {
            startTimer();
        }
    }
}


// ======================================
// BUTTON EVENTS
// ======================================

startButton.addEventListener("click", () => {
    startGame(false);
});
submitButton.addEventListener("click", checkAnswer);
hintButton.addEventListener("click", getHint);

document.getElementById("leaderboard-btn").addEventListener("click", () => {
    window.location.href = "/leaderboard.html";
});

// Initialize
updateDisplay();

submitButton.disabled = true;
hintButton.disabled = true;

checkLogin();

// Resume after Try Again OR start the next level
if (sessionStorage.getItem("autoResumeGame") === "true") {
    sessionStorage.removeItem("autoResumeGame");
    startGame(true);

} else if (sessionStorage.getItem("autoStartGame") === "true") {
    sessionStorage.removeItem("autoStartGame");
    startGame(false);
}
