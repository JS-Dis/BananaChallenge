
const scoreElement = document.getElementById("score");
const livesElement = document.getElementById("lives");
const timerElement = document.getElementById("timer");
const levelElement = document.getElementById("level");
const messageElement = document.getElementById("message");
const puzzleElement = document.getElementById("puzzle");
const answerInput = document.getElementById("answer");
const answerForm = document.getElementById("answer-form");
const startButton = document.getElementById("start-btn");
const hintButton = document.getElementById("hint-btn");

let score = 0;
let lives = 3;
let level = 1;
let timeLeft = 30;
let timer = null;
let gameRunning = false;
let currentHint = null;
let hintUsed = false;

function updateDisplay() {
    scoreElement.textContent = score;
    livesElement.textContent = lives;
    timerElement.textContent = timeLeft;

    const difficulty =
        level === 1 ? "Easy" :
        level === 2 ? "Medium" : "Hard";

    levelElement.textContent = `Level ${level} — ${difficulty}`;
}

async function loadPuzzle() {
    messageElement.textContent = "Loading puzzle...";
    puzzleElement.textContent = "🍌";

    answerInput.disabled = true;
    answerForm.querySelector("button").disabled = true;
    hintButton.disabled = true;

    try {
        const response = await fetch("/api/puzzle");
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Could not load puzzle");
        }

        // Create an image for the Banana API puzzle
        const image = document.createElement("img");
        image.src = data.question;
        image.alt = "Banana puzzle";
        image.style.maxWidth = "100%";
        image.style.maxHeight = "320px";
        image.style.objectFit = "contain";

        image.onerror = () => {
            messageElement.textContent =
                "Puzzle image could not be displayed. Please try again.";
        };

        puzzleElement.replaceChildren(image);

        currentHint = null;
        hintUsed = false;
        answerInput.value = "";
        answerInput.disabled = false;
        answerForm.querySelector("button").disabled = false;
        hintButton.disabled = false;

        messageElement.textContent = "Solve the puzzle!";
    } catch (error) {
        messageElement.textContent =
            "Could not load a puzzle. Check the server and try again.";

        console.error(error);
    }
}

function startTimer() {
    clearInterval(timer);
    timeLeft = 30;
    updateDisplay();

    timer = setInterval(() => {
        timeLeft--;
        timerElement.textContent = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(timer);
            loseLife("Time is up!");
        }
    }, 1000);
}

async function startGame() {
    clearInterval(timer);

    score = 0;
    lives = 3;
    level = 1;
    gameRunning = true;

    updateDisplay();
    startButton.textContent = "Restart Game";

    await loadPuzzle();

    if (gameRunning && lives > 0) {
        startTimer();
    }
}

async function loseLife(reason) {
    if (!gameRunning) return;

    clearInterval(timer);
    lives--;
    updateDisplay();

    if (lives <= 0) {
        endGame();
        messageElement.textContent =
            `${reason} Game over! Final score: ${score}`;
        return;
    }

    messageElement.textContent = `${reason} You lost a life.`;

    await loadPuzzle();

    if (gameRunning && lives > 0) {
        startTimer();
    }
}

async function checkAnswer(event) {
    event.preventDefault();

    if (!gameRunning || answerInput.disabled) return;

    const answer = answerInput.value.trim();

    if (answer === "") {
        messageElement.textContent = "Please enter your answer.";
        return;
    }

    answerInput.disabled = true;
    answerForm.querySelector("button").disabled = true;

    try {
        const response = await fetch("/api/answer", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ answer })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Could not check answer");
        }

        clearInterval(timer);

        if (data.correct) {
            score += 10;
            level++;

            updateDisplay();

            if (level > 3) {
                endGame();
                messageElement.textContent =
                    `Congratulations! You completed all levels! Score: ${score}`;
                return;
            }

            messageElement.textContent = "Correct answer! 🎉 +10 points";

            setTimeout(async () => {
                if (!gameRunning) return;

                await loadPuzzle();

                if (gameRunning) {
                    startTimer();
                }
            }, 1000);
        } else {
            await loseLife("Incorrect answer!");
        }
    } catch (error) {
        console.error(error);
        messageElement.textContent =
            "Could not check your answer. Please try again.";

        if (gameRunning) {
            answerInput.disabled = false;
            answerForm.querySelector("button").disabled = false;
        }
    }
}

async function getHint() {
    if (!gameRunning || answerInput.disabled) return;

    hintUsed = true;

    messageElement.textContent =
        "💡 Hint: Look carefully at the shapes and numbers in the puzzle.";

    // Puzzle-specific hints can be added later.
}

function endGame() {
    clearInterval(timer);
    gameRunning = false;
    answerInput.disabled = true;
    answerForm.querySelector("button").disabled = true;
    hintButton.disabled = true;
    startButton.textContent = "Play Again";
}

startButton.addEventListener("click", startGame);
answerForm.addEventListener("submit", checkAnswer);
hintButton.addEventListener("click", getHint);

updateDisplay();
answerInput.disabled = true;
answerForm.querySelector("button").disabled = true;
hintButton.disabled = true;
