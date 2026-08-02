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
    striker: { name: '', runs: 0, balls: 0, fours: 0, sixes: 0 },
    nonStriker: { name: '', runs: 0, balls: 0, fours: 0, sixes: 0 },
    bowler: { name: '', balls: 0, runs: 0, wickets: 0 },
    currentOverHistory: [],
    historyStack: [],
    modalCallback: null
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

    state.striker.name = document.getElementById('striker-name').value || 'Batter 1';
    state.nonStriker.name = document.getElementById('non-striker-name').value || 'Batter 2';
    state.bowler.name = document.getElementById('bowler-name').value || 'Bowler 1';

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
        currentOverHistory: state.currentOverHistory
    })));
}

function addRuns(r) {
    if (isMatchCompleted()) return;
    saveHistory();

    state.runs += r;
    state.striker.runs += r;
    state.striker.balls++;
    if (r === 4) state.striker.fours++;
    if (r === 6) state.striker.sixes++;

    state.bowler.runs += r;
    state.bowler.balls++;
    state.totalLegalBalls++;

    state.currentOverHistory.push({ text: `${r}`, type: r === 4 ? 'four' : r === 6 ? 'six' : 'normal' });

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
    checkMatchStatus();
    updateUI();
    persistState();
}

function addWicket() {
    if (isMatchCompleted()) return;
    saveHistory();

    state.wickets++;
    state.striker.balls++;
    state.bowler.wickets++;
    state.bowler.balls++;
    state.totalLegalBalls++;

    state.currentOverHistory.push({ text: 'W', type: 'wicket' });

    if (state.wickets < 10) {
        promptModal('Enter New Batter', [
            { id: 'm-p1', placeholder: 'Batter Name' }
        ], (vals) => {
            state.striker = { name: vals[0] || `Batter ${state.wickets + 2}`, runs: 0, balls: 0, fours: 0, sixes: 0 };
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

function swapStrike() {
    const temp = state.striker;
    state.striker = state.nonStriker;
    state.nonStriker = temp;
}

function checkMatchStatus() {
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
            state.runs = 0;
            state.wickets = 0;
            state.totalLegalBalls = 0;
            state.currentOverHistory = [];
            state.striker = { name: vals[0] || 'Batter 1', runs: 0, balls: 0, fours: 0, sixes: 0 };
            state.nonStriker = { name: vals[1] || 'Batter 2', runs: 0, balls: 0, fours: 0, sixes: 0 };
            state.bowler = { name: vals[2] || 'Bowler 1', balls: 0, runs: 0, wickets: 0 };
            updateUI();
            persistState();
        });
        return;
    }

    if (state.currentInnings === 2) {
        if (state.runs >= state.target) {
            alert(`Match Over! ${state.team2} won by ${10 - state.wickets} wickets!`);
            return;
        }
        if (inningsOver && state.runs < state.target - 1) {
            alert(`Match Over! ${state.team1} won by ${state.target - 1 - state.runs} runs!`);
            return;
        }
        if (inningsOver && state.runs === state.target - 1) {
            alert('Match Tied!');
            return;
        }
    }

    checkOverCompletion();
}

function checkOverCompletion() {
    if (state.totalLegalBalls % 6 === 0 && state.totalLegalBalls > 0 && state.currentOverHistory.length > 0) {
        swapStrike();
        state.currentOverHistory = [];
        if (!isMatchCompleted()) {
            promptModal('Enter Next Bowler', [
                { id: 'm-p1', placeholder: 'Bowler Name' }
            ], (vals) => {
                state.bowler = { name: vals[0] || 'Next Bowler', balls: 0, runs: 0, wickets: 0 };
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
    state.currentOverHistory = prev.currentOverHistory;
    updateUI();
    persistState();
}

function updateUI() {
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

    // Target Calculator UI
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

    // Player Stats UI
    document.getElementById('striker-disp').innerText = `* ${state.striker.name}`;
    document.getElementById('striker-stat').innerText = `${state.striker.runs} (${state.striker.balls}) [4s:${state.striker.fours} 6s:${state.striker.sixes}]`;
    
    document.getElementById('non-striker-disp').innerText = state.nonStriker.name;
    document.getElementById('non-striker-stat').innerText = `${state.nonStriker.runs} (${state.nonStriker.balls}) [4s:${state.nonStriker.fours} 6s:${state.nonStriker.sixes}]`;

    const bowlerOvers = `${Math.floor(state.bowler.balls / 6)}.${state.bowler.balls % 6}`;
    document.getElementById('bowler-disp').innerText = state.bowler.name;
    document.getElementById('bowler-stat').innerText = `${bowlerOvers} ov - ${state.bowler.runs}r - ${state.bowler.wickets}w`;

    // History Badges
    const historyContainer = document.getElementById('ball-history');
    historyContainer.innerHTML = '';
    state.currentOverHistory.forEach(ball => {
        const badge = document.createElement('div');
        badge.className = `ball-badge ${ball.type}`;
        badge.innerText = ball.text;
        historyContainer.appendChild(badge);
    });
}

function exportPDF() {
    const element = document.getElementById('match-report');
    html2pdf().from(element).save(`${state.team1}_vs_${state.team2}_Match_Report.pdf`);
}

function resetMatch() {
    if (confirm('Reset all match data? This cannot be undone.')) {
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
    }
}
