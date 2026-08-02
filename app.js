const STORAGE_KEY = 'cricket_scorer_state';

let state = {
    currentInnings: 1,
    team1: '',
    team2: '',
    maxOvers: 20,
    firstInningsScore: 0,
    target: null,
    runs: 0,
    wickets: 0,
    totalLegalBalls: 0,
    // CURRENT active players
    striker: { id: 0, name: '', runs: 0, balls: 0, fours: 0, sixes: 0, status: 'not out' },
    nonStriker: { id: 1, name: '', runs: 0, balls: 0, fours: 0, sixes: 0, status: 'not out' },
    bowler: { name: '', balls: 0, runs: 0, wickets: 0, maidens: 0 },
    // Historical stats for completed scorecard
    allBatters: [],
    allBowlers: [],
    // General historical over history (this will NOT be on the PDF)
    currentOverHistory: [],
    historyStack: [],
    modalCallback: null,
    finalResultText: '',
    inningsCompleted: { '1': false, '2': false }
};

window.onload = function() {
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (savedState) {
        try {
            state = JSON.parse(savedState);
            document.getElementById('setup-screen').classList.add('hidden');
            document.getElementById('scoreboard-screen').classList.remove('hidden');
            updateUI();
        } catch(e) {
            localStorage.removeItem(STORAGE_KEY);
        }
    }
};

function persistState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function startMatch() {
    state.team1 = document.getElementById('batting-team').value || 'Team A';
    state.team2 = document.getElementById('bowling-team').value || 'Team B';
    state.maxOvers = parseInt(document.getElementById('total-overs').value) || 20;

    // Initialize opening batters with status 'not out'
    state.striker = { id: 0, name: document.getElementById('striker-name').value || 'Batter 1', runs: 0, balls: 0, fours: 0, sixes: 0, status: 'not out' };
    state.nonStriker = { id: 1, name: document.getElementById('non-striker-name').value || 'Batter 2', runs: 0, balls: 0, fours: 0, sixes: 0, status: 'not out' };
    
    // Add them to the historical list
    state.allBatters.push(state.striker, state.nonStriker);

    state.bowler = { name: document.getElementById('bowler-name').value || 'Bowler 1', balls: 0, runs: 0, wickets: 0, maidens: 0 };
    
    // Add bowler to history
    state.allBowlers.push(state.bowler);

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('scoreboard-screen').classList.remove('hidden');
    
    updateUI();
    persistState();
}

function saveHistory() {
    state.historyStack.push(JSON.parse(JSON.stringify({
        currentInnings: state.currentInnings,
        runs: state.runs, wickets: state.wickets, totalLegalBalls: state.totalLegalBalls,
        striker: state.striker, nonStriker: state.nonStriker, bowler: state.bowler,
        allBatters: state.allBatters, allBowlers: state.allBowlers,
        currentOverHistory: state.currentOverHistory
    })));
}

function addRuns(r) {
    if (isMatchOver()) return;
    saveHistory();

    state.runs += r;
    
    // Update active striker stats
    state.striker.runs += r;
    state.striker.balls++;
    if (r === 4) state.striker.fours++;
    if (r === 6) state.striker.sixes++;

    // Update active bowler stats
    state.bowler.runs += r;
    state.bowler.balls++;
    state.totalLegalBalls++;

    state.currentOverHistory.push({ text: `${r}`, type: r === 4 ? 'four' : r === 6 ? 'six' : 'normal' });

    // Sync historical record
    syncActivePlayersToHistory();

    if (r % 2 !== 0) swapStrike();
    checkMatchStatus();
    updateUI();
    persistState();
}

function addExtra(type) {
    if (isMatchOver()) return;
    saveHistory();

    state.runs += 1;
    state.bowler.runs += 1;
    const label = type === 'wide' ? 'WD' : 'NB';
    state.currentOverHistory.push({ text: label, type: 'extra' });
    
    // NB counts as a ball for the batter and bowler in some rules, but not standard T20
    // state.striker.balls++; 
    // state.bowler.balls++; 
    // This template keeps it standard where WD/NB don't increase balls counts.

    checkMatchStatus();
    updateUI();
    persistState();
}

function addWicket() {
    if (isMatchOver()) return;
    saveHistory();

    state.wickets++;
    state.striker.balls++;
    state.striker.status = 'out'; // Important for PDF

    state.bowler.wickets++;
    state.bowler.balls++;
    state.totalLegalBalls++;

    state.currentOverHistory.push({ text: 'W', type: 'wicket' });

    // Sync historical record before replacing the batter
    syncActivePlayersToHistory();

    if (state.wickets < 10) {
        promptModal('Enter New Batter', [
            { id: 'm-p1', placeholder: 'Batter Name' }
        ], (vals) => {
            // New batter info
            const name = vals[0] || `Batter ${state.wickets + 2}`;
            state.striker = { id: state.wickets + 1, name: name, runs: 0, balls: 0, fours: 0, sixes: 0, status: 'not out' };
            // Add new batter to scorecard history
            state.allBatters.push(state.striker);
            
            checkMatchStatus();
            updateUI();
            persistState();
        });
    } else {
        checkMatchStatus();
        updateUI();
        persistState();
    }
}

// Ensure current batter/bowler data in state.allBatters/allBowlers is correct
function syncActivePlayersToHistory() {
    // Find batter in allBatters array and update them
    let sIdx = state.allBatters.findIndex(b => b.id === state.striker.id);
    if(sIdx !== -1) state.allBatters[sIdx] = JSON.parse(JSON.stringify(state.striker));
    
    let nsIdx = state.allBatters.findIndex(b => b.id === state.nonStriker.id);
    if(nsIdx !== -1) state.allBatters[nsIdx] = JSON.parse(JSON.stringify(state.nonStriker));

    // Bowler is matched by name
    let blIdx = state.allBowlers.findIndex(bl => bl.name === state.bowler.name);
    if(blIdx !== -1) state.allBowlers[blIdx] = JSON.parse(JSON.stringify(state.bowler));
}

function swapStrike() {
    const temp = state.striker;
    state.striker = state.nonStriker;
    state.nonStriker = temp;
}

function checkMatchStatus() {
    if (isMatchOver()) {
        state.inningsCompleted[state.currentInnings] = true;
        setMatchOverUI();
        return;
    }

    const inningsOver = state.wickets >= 10 || state.totalLegalBalls >= state.maxOvers * 6;

    if (state.currentInnings === 1 && inningsOver) {
        state.firstInningsScore = state.runs;
        state.target = state.runs + 1;
        promptModal('1st Innings Complete!', [
            { id: 'm-p1', placeholder: 'Chasing Striker Name' },
            { id: 'm-p2', placeholder: 'Chasing Non-Striker Name' },
            { id: 'm-p3', placeholder: 'Opening Bowler Name' }
        ], (vals) => {
            state.currentInnings = 2;
            
            // Clear scores but KEEP ALL_BATTERS/ALL_BOWLERS data
            // We only clear these once the complete match is over
            state.runs = 0;
            state.wickets = 0;
            state.totalLegalBalls = 0;
            state.currentOverHistory = [];
            state.historyStack = [];
            
            state.striker = { id: 100, name: vals[0] || 'Batter 1 (2nd Inn)', runs: 0, balls: 0, fours: 0, sixes: 0, status: 'not out' };
            state.nonStriker = { id: 101, name: vals[1] || 'Batter 2 (2nd Inn)', runs: 0, balls: 0, fours: 0, sixes: 0, status: 'not out' };
            state.bowler = { name: vals[2] || 'Bowler 1 (2nd Inn)', balls: 0, runs: 0, wickets: 0, maidens: 0 };
            
            state.allBatters.push(state.striker, state.nonStriker);
            state.allBowlers.push(state.bowler);

            updateUI();
            persistState();
        });
        return;
    }

    if (state.currentInnings === 2) {
        if (state.runs >= state.target) {
            state.inningsCompleted[state.currentInnings] = true;
            state.finalResultText = `Match Over! ${state.team2} won by${10 - state.wickets} wickets!`;
            alert(state.finalResultText);
            setMatchOverUI();
            return;
        }
        if (inningsOver && state.runs < state.target - 1) {
            state.inningsCompleted[state.currentInnings] = true;
            state.finalResultText = `Match Over! ${state.team1} won by${state.target - 1 - state.runs} runs!`;
            alert(state.finalResultText);
            setMatchOverUI();
            return;
        }
        if (inningsOver && state.runs === state.target - 1) {
            state.inningsCompleted[state.currentInnings] = true;
            state.finalResultText = 'Match Tied!';
            alert(state.finalResultText);
            setMatchOverUI();
            return;
        }
    }

    checkOverCompletion();
}

function checkOverCompletion() {
    if (state.totalLegalBalls % 6 === 0 && state.totalLegalBalls > 0 && state.currentOverHistory.length > 0) {
        swapStrike();
        state.currentOverHistory = [];
        syncActivePlayersToHistory(); // Sync bowler maidens etc.
        
        if (!isMatchOver()) {
            promptModal('Enter Next Bowler', [
                { id: 'm-p1', placeholder: 'Bowler Name' }
            ], (vals) => {
                const name = vals[0] || 'Next Bowler';
                // Find if this bowler has bowled before
                let blIdx = state.allBowlers.findIndex(bl => bl.name === name);
                if(blIdx !== -1) {
                    state.bowler = state.allBowlers[blIdx];
                } else {
                    state.bowler = { name: name, balls: 0, runs: 0, wickets: 0, maidens: 0 };
                    state.allBowlers.push(state.bowler);
                }
                updateUI();
                persistState();
            });
        }
    }
}

function isMatchOver() {
    return state.inningsCompleted[1] && state.inningsCompleted[2];
}

function setMatchOverUI() {
    syncActivePlayersToHistory();
    // Disable scoring controls when match is officially complete
    const btns = document.querySelectorAll('.run-btn, .wicket-btn, .extra-btn');
    btns.forEach(b => b.disabled = true);
    
    // Highlight export PDF button
    document.getElementById('export-btn').style.background = '#0077b6';
}

// Modal helper remains similar
function promptModal(title, inputsConfig, callback) {
    state.modalCallback = callback;
    document.getElementById('modal-title').innerText = title;
    const container = document.getElementById('modal-inputs');
    container.innerHTML = '';
    
    inputsConfig.forEach(cfg => {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.id = cfg.id;
        inp.placeholder = cfg.placeholder;
        container.appendChild(inp);
    });

    document.getElementById('player-modal').classList.remove('hidden');
}

function confirmModal() {
    const container = document.getElementById('modal-inputs');
    const inputs = container.querySelectorAll('input');
    const values = Array.from(inputs).map(i => i.value.trim());
    document.getElementById('player-modal').classList.add('hidden');
    if (state.modalCallback) state.modalCallback(values);
}

function undoLastAction() {
    if (state.historyStack.length === 0) return;
    const prev = state.historyStack.pop();
    state.currentInnings = prev.currentInnings;
    state.runs = prev.runs;
    state.wickets = prev.wickets;
    state.totalLegalBalls = prev.totalLegalBalls;
    state.striker = prev.striker;
    state.nonStriker = prev.nonStriker;
    state.bowler = prev.bowler;
    state.allBatters = prev.allBatters;
    state.allBowlers = prev.allBowlers;
    state.currentOverHistory = prev.currentOverHistory;
    
    // Re-enable buttons
    const btns = document.querySelectorAll('.run-btn, .wicket-btn, .extra-btn');
    btns.forEach(b => b.disabled = false);

    updateUI();
    persistState();
}

function updateUI() {
    // Current In-Game UI remains similar
    const batting = state.currentInnings === 1 ? state.team1 : state.team2;
    const bowling = state.currentInnings === 1 ? state.team2 : state.team1;
    
    document.getElementById('innings-tag').innerText = `${state.currentInnings === 1 ? '1st' : '2nd'} Innings`;
    document.getElementById('teams-header').innerText = `${batting} vs${bowling}`;
    document.getElementById('max-overs').innerText = state.maxOvers;
    document.getElementById('score-runs').innerText = state.runs;
    document.getElementById('score-wickets').innerText = state.wickets;

    const overs = `${Math.floor(state.totalLegalBalls / 6)}.${state.totalLegalBalls % 6}`;
    document.getElementById('completed-overs').innerText = overs;

    const crr = state.totalLegalBalls > 0 ? (state.runs / (state.totalLegalBalls / 6)).toFixed(2) : '0.00';
    document.getElementById('run-rate').innerText = crr;

    const targetBox = document.getElementById('target-container');
    if (state.currentInnings === 2) {
        targetBox.classList.remove('hidden');
        const remainingBalls = (state.maxOvers * 6) - state.totalLegalBalls;
        const runsNeeded = Math.max(0, state.target - state.runs);
        const rrr = remainingBalls > 0 ? ((runsNeeded / remainingBalls) * 6).toFixed(2) : '0.00';
        document.getElementById('target-runs').innerText = state.target;
        document.getElementById('runs-needed').innerText = runsNeeded;
        document.getElementById('balls-remaining').innerText = remainingBalls;
        document.getElementById('req-run-rate').innerText = rrr;
    } else {
        targetBox.classList.add('hidden');
    }

    document.getElementById('striker-disp').innerText = `* ${state.striker.name}`;
    document.getElementById('striker-stat').innerText = `${state.striker.runs} (${state.striker.balls}) [4s:${state.striker.fours} 6s:${state.striker.sixes}]`;
    document.getElementById('non-striker-disp').innerText = state.nonStriker.name;
    document.getElementById('non-striker-stat').innerText = `${state.nonStriker.runs} (${state.nonStriker.balls}) [4s:${state.nonStriker.fours} 6s:${state.nonStriker.sixes}]`;
    const bowlerOvers = `${Math.floor(state.bowler.balls / 6)}.${state.bowler.balls % 6}`;
    document.getElementById('bowler-disp').innerText = state.bowler.name;
    document.getElementById('bowler-stat').innerText = `${bowlerOvers} ov - ${state.bowler.runs}r -${state.bowler.wickets}w`;

    const historyContainer = document.getElementById('ball-history');
    historyContainer.innerHTML = '';
    state.currentOverHistory.forEach(ball => {
        const badge = document.createElement('div');
        badge.className = `ball-badge ${ball.type}`;
        badge.innerText = ball.text;
        historyContainer.appendChild(badge);
    });
}

// Function to generate the Printable Scorecard Tables from our historical arrays
function buildPrintTables() {
    syncActivePlayersToHistory(); // Last sync before printing

    const header = document.getElementById('print-header');
    header.innerText = `${state.team1} vs${state.team2}`;
    
    document.getElementById('print-final-result').innerHTML = `<strong>Result:</strong> ${state.finalResultText || 'Match incomplete'}`;

    // Fill Batting Table
    const batBody = document.getElementById('print-batting-body');
    batBody.innerHTML = '';
    
    state.allBatters.forEach(batter => {
        const row = document.createElement('tr');
        const sr = batter.balls > 0 ? ((batter.runs / batter.balls) * 100).toFixed(2) : '0.00';
        row.innerHTML = `
            <td><strong>${batter.name}</strong></td>
            <td style="color: ${batter.status === 'out' ? '#842029' : '#2d6a4f'}">${batter.status === 'out' ? 'Dismissed' : 'not out'}</td>
            <td><strong>${batter.runs}</strong></td>
            <td>${batter.balls}</td>
            <td>${batter.fours}</td>
            <td>${batter.sixes}</td>
            <td>${sr}</td>
        `;
        batBody.appendChild(row);
    });

    // Fill Bowling Table
    const bowlBody = document.getElementById('print-bowling-body');
    bowlBody.innerHTML = '';
    state.allBowlers.forEach(bowler => {
        if(bowler.balls === 0) return; // Skip bowlers who never finished an action

        const row = document.createElement('tr');
        const overs = `${Math.floor(bowler.balls / 6)}.${bowler.balls % 6}`;
        const econ = bowler.balls > 0 ? ((bowler.runs / bowler.balls) * 6).toFixed(2) : '0.00';
        row.innerHTML = `
            <td><strong>${bowler.name}</strong></td>
            <td>${overs}</td>
            <td>0</td> <!-- Maiden calc is complex without over logs -->
            <td>${bowler.runs}This is a very important and powerful upgrade. The app we built is **designed to be very lightweight** and keeps **zero historical data** in memory. When a match is reset or reloaded, all detailed over-by-over and player statistics are erased. This is what makes it work so well on a mobile phone without needing a database.

While we cannot generate a **retroactive** PDF of a complete past match, we **can** modify the app to include a detailed **Final Match Summary (A Match Report)** that can be printed as a PDF *before* you press reset.

Here is the exact code to upgrade your files to support detailed player scorecard reporting for the **whole squad** that batted or bowled.

---

### Step-by-step: Updating your files for a better PDF Report

#### 1. Update `index.html` (Replace the whole file)

This change is crucial: we are adding a special section that is **hidden on the screen** but becomes visible when you create a PDF. This section contains the tables for the full scorecard.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cricket Pro Scorer</title>
    <link rel="stylesheet" href="styles.css">
    <link rel="manifest" href="manifest.json">
    <script src="[https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js](https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js)"></script>
    <style>
        /* New styling to support a printed-only detailed scorecard */
        #print-only-card { display: none; margin-top: 20px; }
        .print-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.9rem;}
        .print-table th, .print-table td { border: 1px solid #ddd; padding: 6px; text-align: left; }
        .print-table th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="app-container" id="match-report">
        <header>
            <h1>Cricket Live Scorer</h1>
        </header>

        <!-- Setup Screen -->
        <section id="setup-screen" class="card">
            <h2>Match Setup</h2>
            <div class="form-group">
                <label for="batting-team">1st Innings Batting Team</label>
                <input type="text" id="batting-team" value="Rouen Cricket Club">
            </div>
            <div class="form-group">
                <label for="bowling-team">1st Innings Bowling Team</label>
                <input type="text" id="bowling-team" value="Opponent XI">
            </div>
            <div class="form-group">
                <label for="total-overs">Total Overs Per Innings</label>
                <input type="number" id="total-overs" value="20" min="1" max="50">
            </div>
            <hr class="divider">
            <h3>Opening Players</h3>
            <div class="form-group">
                <label for="striker-name">Striker Name</label>
                <input type="text" id="striker-name" placeholder="Batter 1">
            </div>
            <div class="form-group">
                <label for="non-striker-name">Non-Striker Name</label>
                <input type="text" id="non-striker-name" placeholder="Batter 2">
            </div>
            <div class="form-group">
                <label for="bowler-name">Bowler Name</label>
                <input type="text" id="bowler-name" placeholder="Bowler 1">
            </div>
            <button class="btn btn-primary" onclick="startMatch()">Start Match</button>
        </section>

        <!-- Main Scoreboard Screen -->
        <section id="scoreboard-screen" class="card hidden">
            <div class="score-display">
                <div class="innings-tag" id="innings-tag">1st Innings</div>
                <h2 id="teams-header">Team A vs Team B</h2>
                <div class="main-score">
                    <span id="score-runs">0</span> / <span id="score-wickets">0</span>
                </div>
                <div class="overs-display">
                    Overs: <span id="completed-overs">0.0</span> / <span id="max-overs">20</span> | CRR: <span id="run-rate">0.00</span>
                </div>
                
                <!-- Target Box for 2nd Innings -->
                <div id="target-container" class="target-box hidden">
                    Target: <span id="target-runs">0</span> | Need <span id="runs-needed">0</span> from <span id="balls-remaining">0</span> balls (RRR: <span id="req-run-rate">0.00</span>)
                </div>
            </div>

            <!-- Player Stats Section -->
            <div class="stats-card">
                <div class="stat-row active-batter" id="striker-row">
                    <span class="player-name"><strong id="striker-disp">*Batter 1</strong></span>
                    <span class="player-stat" id="striker-stat">0 (0) [4s:0 6s:0]</span>
                </div>
                <div class="stat-row" id="non-striker-row">
                    <span class="player-name" id="non-striker-disp">Batter 2</span>
                    <span class="player-stat" id="non-striker-stat">0 (0) [4s:0 6s:0]</span>
                </div>
                <hr>
                <div class="stat-row">
                    <span class="player-name" id="bowler-disp">Bowler 1</span>
                    <span class="player-stat" id="bowler-stat">0.0 - 0 - 0w</span>
                </div>
            </div>

            <!-- Recent Balls -->
            <div class="recent-balls-container">
                <h3>This Over:</h3>
                <div id="ball-history" class="ball-history"></div>
            </div>

            <!-- New Section: Final Detailed Scorecard (Hidden until PDF generation) -->
            <section id="print-only-card" class="card">
                <h2>Final Match Report</h2>
                <h3 id="print-header">Rouen Cricket Club vs Opponent XI</h3>
                <div id="print-final-result" class="divider">...</div>
                
                <div id="print-card-tables">
                    <!-- Complete Batting Scorecard Table -->
                    <h4>Batting</h4>
                    <table class="print-table" id="print-batting-table">
                        <thead><tr><th>Batter</th><th>Status</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
                        <tbody id="print-batting-body"></tbody>
                    </table>

                    <!-- Complete Bowling Scorecard Table -->
                    <h4 style="margin-top: 15px;">Bowling</h4>
                    <table class="print-table" id="print-bowling-table">
                        <thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr></thead>
                        <tbody id="print-bowling-body"></tbody>
                    </table>
                </div>
            </section>

            <!-- Scoring Controls -->
            <div class="controls-grid">
                <button class="btn run-btn" onclick="addRuns(0)">0</button>
                <button class="btn run-btn" onclick="addRuns(1)">1</button>
                <button class="btn run-btn" onclick="addRuns(2)">2</button>
                <button class="btn run-btn" onclick="addRuns(3)">3</button>
                <button class="btn run-btn boundary" onclick="addRuns(4)">4</button>
                <button class="btn run-btn boundary" onclick="addRuns(6)">6</button>
                
                <button class="btn extra-btn" onclick="addExtra('wide')">WD</button>
                <button class="btn extra-btn" onclick="addExtra('noball')">NB</button>
                <button class="btn extra-btn" onclick="swapStrike()">Swap Strike</button>
                <button class="btn wicket-btn" onclick="addWicket()">WICKET</button>
            </div>

            <div class="action-footer">
                <button class="btn btn-secondary" onclick="undoLastAction()">Undo</button>
                <button class="btn btn-export" id="export-btn" onclick="exportPDF()">Export Final PDF</button>
                <button class="btn btn-danger" id="reset-btn" onclick="resetMatch()">Reset</button>
            </div>
        </section>
    </div>

    <!-- Modal for New Player Entry / Innings Switch -->
    <div id="player-modal" class="modal hidden">
        <div class="modal-content">
            <h3 id="modal-title">Enter Next Player</h3>
            <div id="modal-inputs">
                <input type="text" id="modal-player-input" placeholder="Player Name">
            </div>
            <button class="btn btn-primary" onclick="confirmModal()">Submit</button>
        </div>
    </div>

    <script src="app.js"></script>
    <script>
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js');
        }
    </script>
</body>
</html>
