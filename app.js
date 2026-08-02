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
    if (isMatchCompleted()) return;
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
    if (isMatchCompleted()) return;
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
    if (isMatchCompleted()) return;
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
    if (isMatchCompleted()) {
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
            state.finalResultText = `Match Over! ${state.team2} won by ${10 - state.wickets} wickets!`;
            alert(state.finalResultText);
            setMatchOverUI();
            return;
        }
        if (inningsOver && state.runs < state.target - 1) {
            state.inningsCompleted[state.currentInnings] = true;
            state.finalResultText = `Match Over! ${state.team1} won by ${state.target - 1 - state.runs} runs!`;
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
        
        if (!isMatchCompleted()) {
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

function isMatchCompleted() {
    if (state.currentInnings === 2) {
        return state.runs >= state.target || state.wickets >= 10 || state.totalLegalBalls >= state.maxOvers * 6;
    }
    return false;
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
    document.getElementById('teams-header').innerText = `${batting} vs ${bowling}`;
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
    document.getElementById('bowler-stat').innerText = `${bowlerOvers} ov - ${state.bowler.runs}r - ${state.bowler.wickets}w`;

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
    header.innerText = `${state.team1} vs ${state.team2}`;
    
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
            <td>${bowler.runs}</td>
            <td><strong>${bowler.wickets}</strong></td>
            <td>${econ}</td>
        `;
        bowlBody.appendChild(row);
    });
}

function exportPDF() {
    // 1. Build the scorecard tables from history data
    buildPrintTables();
    
    // 2. Temporarily show the print section and hide controls
    const controls = document.querySelectorAll('.controls-grid, .score-display, .stats-card, .recent-balls-container, .innings-tag');
    controls.forEach(c => c.style.display = 'none');
    document.getElementById('print-only-card').style.display = 'block';

    // 3. Generate PDF
    const element = document.getElementById('match-report');
    const filename = `${state.team1}_vs_${state.team2}_Complete_Match_Report.pdf`;
    
    html2pdf()
        .set({ margin: 10, filename: filename, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } })
        .from(element)
        .save()
        .then(() => {
            // 4. Restore UI after generation
            controls.forEach(c => c.style.display = '');
            document.getElementById('print-only-card').style.display = 'none';
        });
}

function resetMatch() {
    if (confirm('Reset all match data? This cannot be undone.')) {
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
    }
}
