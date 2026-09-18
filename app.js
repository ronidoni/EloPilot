// Экраны
const searchSec = document.getElementById('search-section');
const statsSec = document.getElementById('stats-section');
const historySec = document.getElementById('history-section');
const matchSec = document.getElementById('match-section');

// Глобальные переменные
let currentPlayerId = null;
let currentNickname = null;
let currentLifetimeStats = null;
let currentTopMapsStats = null;
let currentMapImages = {};
const recentSearchesKey = 'elopilot-recent-searches';

function getRecentSearches() {
    try {
        const storedSearches = JSON.parse(localStorage.getItem(recentSearchesKey) || '[]');
        return Array.isArray(storedSearches) ? storedSearches.filter(Boolean).slice(0, 5) : [];
    } catch (error) {
        return [];
    }
}

function renderRecentSearches() {
    const container = document.getElementById('recent-searches');
    const searches = getRecentSearches();
    container.innerHTML = '';
    container.classList.toggle('hidden', searches.length === 0);

    if (searches.length === 0) return;

    const label = document.createElement('span');
    label.className = 'recent-searches-label';
    label.textContent = 'Недавние профили';
    container.appendChild(label);

    searches.forEach(search => {
        const button = document.createElement('button');
        button.className = 'recent-search-chip';
        button.type = 'button';
        button.textContent = search;
        button.addEventListener('click', () => {
            document.getElementById('nickname-input').value = search;
            analyze();
        });
        container.appendChild(button);
    });
}

function rememberSearch(nickname) {
    const searches = [nickname, ...getRecentSearches().filter(search => search.toLowerCase() !== nickname.toLowerCase())].slice(0, 5);
    localStorage.setItem(recentSearchesKey, JSON.stringify(searches));
    renderRecentSearches();
}

function openLocalProfile(nickname) {
    document.getElementById('nickname-input').value = nickname;
    analyze();
}

function avatarFallback(nickname) {
    const initials = String(nickname || '?').slice(0, 2).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#283126"/><text x="32" y="39" text-anchor="middle" fill="#d8ff45" font-family="Arial" font-size="20" font-weight="700">${initials}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// Навигация
function showScreen(screen) {
    searchSec.classList.add('hidden');
    statsSec.classList.add('hidden');
    historySec.classList.add('hidden');
    matchSec.classList.add('hidden');
    screen.classList.remove('hidden');
}

// 1. АНАЛИЗ ИГРОКА (Главный дашборд)
async function analyze() {
    const nick = document.getElementById('nickname-input').value.trim();
    if (!nick) return;

    const errBox = document.getElementById('error-msg');
    const searchBtn = document.getElementById('search-btn');
    
    errBox.textContent = '';
    searchBtn.disabled = true;
    searchBtn.textContent = 'Сбор данных...';
    
    try {
        const res = await fetch(`/api/player/${nick}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Игрок не найден');

        currentPlayerId = data.player.player_id;
        currentNickname = data.player.nickname;
        currentLifetimeStats = data.lifetime;
        rememberSearch(currentNickname);

        const cs2Stats = data.player.games?.cs2 || {};

        // --- 1. ПРОФИЛЬ ---
        document.getElementById('player-avatar').src = data.player.avatar || avatarFallback(data.player.nickname);
        document.getElementById('player-name').textContent = data.player.nickname;
        document.getElementById('report-title').textContent = data.player.nickname;
        document.getElementById('player-elo').textContent = cs2Stats.faceit_elo || 'N/A';

        const registeredAt = data.player.activated_at ? new Date(data.player.activated_at) : null;
        document.getElementById('player-registered').textContent = registeredAt && !Number.isNaN(registeredAt.getTime())
            ? `FACEIT с ${registeredAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`
            : 'FACEIT с --';

        const faceitProfileLink = document.getElementById('faceit-profile-link');
        faceitProfileLink.href = (data.player.faceit_url || `https://www.faceit.com/en/players/${encodeURIComponent(data.player.nickname)}`).replace('{lang}', 'en');

        // --- 2. ДИНАМИЧЕСКИЙ БЕЙДЖ УРОВНЯ FACEIT ---
        const skillLevel = parseInt(cs2Stats.skill_level || 0);
        const levelWidget = document.getElementById('faceit-level-widget');
        
        if (skillLevel > 0) {
            levelWidget.classList.remove('hidden');
            document.getElementById('player-level-text').textContent = skillLevel;
            
            const levelConfig = {
                1:  { color: '#ffffff', fill: 0.10 },
                2:  { color: '#1ee600', fill: 0.20 },
                3:  { color: '#1ee600', fill: 0.30 },
                4:  { color: '#ffc700', fill: 0.40 },
                5:  { color: '#ffc700', fill: 0.50 },
                6:  { color: '#ff8500', fill: 0.60 },
                7:  { color: '#ff8500', fill: 0.70 },
                8:  { color: '#fe0000', fill: 0.80 },
                9:  { color: '#fe0000', fill: 0.90 },
                10: { color: '#fe0000', fill: 1.00 } 
            };

            const config = levelConfig[skillLevel] || levelConfig[1];
            const lvlProgress = document.getElementById('lvl-progress');
            
            setTimeout(() => {
                lvlProgress.style.stroke = config.color;
                lvlProgress.style.strokeDashoffset = 263.9 - (config.fill * 263.9);
            }, 200);
        } else {
            levelWidget.classList.add('hidden');
        }

        // --- 3. ГЛОБАЛЬНАЯ СТАТИСТИКА ---
        const lt = data.lifetime;
        
        document.getElementById('kd-ratio').textContent = lt['Average K/D Ratio'] || '-';
        document.getElementById('win-rate').textContent = (lt['Win Rate %'] || '-') + '%';
        document.getElementById('total-matches').textContent = lt['Matches'] || '-';
        document.getElementById('total-wins').textContent = lt['Wins'] || '-';
        document.getElementById('hs-percent').textContent = (lt['Average Headshots %'] || '-') + '%';
        document.getElementById('win-streak').textContent = lt['Current Win Streak'] || '0';
        document.getElementById('longest-streak').textContent = lt['Longest Win Streak'] || '0';

        // Парсинг скрытых данных
        let tKills = 0, tDeaths = 0, tHs = 0, tRounds = 0;
        
        if (data.maps && data.maps.length > 0) {
            const mapStats = data.maps.filter(m => m.mode === '5v5');
            mapStats.forEach(m => {
                tKills += parseInt(String(m.stats.Kills || '0').replace(/[\s,]/g, ''), 10) || 0;
                tDeaths += parseInt(String(m.stats.Deaths || '0').replace(/[\s,]/g, ''), 10) || 0;
                tHs += parseInt(String(m.stats.Headshots || '0').replace(/[\s,]/g, ''), 10) || 0;
                tRounds += parseInt(String(m.stats.Rounds || '0').replace(/[\s,]/g, ''), 10) || 0;
            });
        }

        const finalKills = parseInt(String(lt['Kills'] || '0').replace(/[\s,]/g, ''), 10) || tKills;
        const finalDeaths = parseInt(String(lt['Deaths'] || '0').replace(/[\s,]/g, ''), 10) || tDeaths;
        const finalHs = parseInt(String(lt['Headshots'] || '0').replace(/[\s,]/g, ''), 10) || tHs;
        const finalRounds = parseInt(String(lt['Rounds'] || '0').replace(/[\s,]/g, ''), 10) || tRounds;

        document.getElementById('total-kills').textContent = finalKills > 0 ? finalKills : '-';
        document.getElementById('total-deaths').textContent = finalDeaths > 0 ? finalDeaths : '-';
        document.getElementById('total-hs').textContent = finalHs > 0 ? finalHs : '-';
        document.getElementById('total-rounds').textContent = finalRounds > 0 ? finalRounds : '-';
        document.getElementById('kr-ratio').textContent = finalRounds > 0 ? (finalKills / finalRounds).toFixed(2) : '-';

        const formatMetric = (key, asPercent = false) => {
            const value = parseFloat(lt[key]);
            if (!Number.isFinite(value)) return '-';
            return asPercent ? `${Math.round(value * 100)}%` : Number.isInteger(value) ? value : value.toFixed(2);
        };

        const advancedMetrics = {
            'adr-stat': formatMetric('ADR'),
            'entry-rate': formatMetric('Entry Rate', true),
            'entry-success': formatMetric('Entry Success Rate', true),
            'clutch-1v1': formatMetric('1v1 Win Rate', true),
            'clutch-1v2': formatMetric('1v2 Win Rate', true),
            'flash-success': formatMetric('Flash Success Rate', true),
            'enemies-flashed-round': formatMetric('Enemies Flashed per Round'),
            'flashes-round': formatMetric('Flashes per Round'),
            'utility-round': formatMetric('Utility Usage per Round'),
            'utility-success': formatMetric('Utility Success Rate', true),
            'sniper-rate': formatMetric('Sniper Kill Rate', true),
            'utility-damage': formatMetric('Total Utility Damage'),
            'clutch-1v1-wins': formatMetric('Total 1v1 Wins'),
            'clutch-1v2-wins': formatMetric('Total 1v2 Wins'),
            'entry-wins': formatMetric('Total Entry Wins'),
            'flash-success-count': formatMetric('Total Flash Successes')
        };

        Object.entries(advancedMetrics).forEach(([id, value]) => {
            document.getElementById(id).textContent = value;
        });

        // --- 4. PILOT RATING 3.0 ---
        const kd = parseFloat(lt['Average K/D Ratio']) || 1.0;
        const winRate = parseFloat(lt['Win Rate %']) || 50.0;
        const hs = parseFloat(lt['Average Headshots %']) || 45.0;
        const kr = finalRounds > 0 ? (finalKills / finalRounds) : 0.67;

        let pilotRating = ((kr / 0.67) * 0.45) + ((kd / 1.0) * 0.35) + ((winRate / 50.0) * 0.15) + ((hs / 45.0) * 0.05);

        if (kd > 1.15 && kr < 0.70) pilotRating -= 0.06; // Штраф байтерам
        if (kr > 0.80) pilotRating += 0.04; // Бонус агрессорам
        if (kr < 0.60) pilotRating -= 0.05; // Штраф якорям

        pilotRating = pilotRating.toFixed(2);
        
        document.getElementById('pilot-rating-value').textContent = pilotRating;
        
        const ratingTitle = document.querySelector('.rating-title');
        if (ratingTitle) ratingTitle.textContent = 'Pilot Rating 3.0';

        let ratingColor = '#ef4444', ratingText = 'Лоу-таб';
        if (pilotRating >= 0.90) { ratingColor = '#f97316'; ratingText = 'Ниже среднего'; }
        if (pilotRating >= 1.00) { ratingColor = '#eab308'; ratingText = 'База (AVG)'; }
        if (pilotRating >= 1.05) { ratingColor = '#10b981'; ratingText = 'Хорошо'; }
        if (pilotRating >= 1.15) { ratingColor = '#3b82f6'; ratingText = 'Сильный импакт'; }
        if (pilotRating >= 1.25) { ratingColor = '#8b5cf6'; ratingText = 'Монстр (Тир-1)'; }

        const ratingCircle = document.getElementById('rating-progress');
        setTimeout(() => {
            ratingCircle.style.stroke = ratingColor;
            ratingCircle.style.strokeDashoffset = 251.2 - (Math.min(pilotRating / 1.35, 1) * 251.2);
        }, 100);

        const desc = document.getElementById('rating-desc');
        desc.textContent = ratingText;
        desc.style.color = ratingColor;
        desc.style.border = `1px solid ${ratingColor}40`;

        // --- 5. ПОСЛЕДНИЕ МАТЧИ И КАРТЫ ---
        const recentContainer = document.getElementById('recent-matches');
        recentContainer.innerHTML = '';
        if (lt['Recent Results']) {
            lt['Recent Results'].forEach(res => {
                const div = document.createElement('div');
                div.className = `match-result ${res === '1' ? 'match-w' : 'match-l'}`;
                div.textContent = res === '1' ? 'W' : 'L';
                recentContainer.appendChild(div);
            });
        }

        const mapsContainer = document.getElementById('maps-container');
        mapsContainer.innerHTML = '';
        currentTopMapsStats = [];
        currentMapImages = {};
        if (data.maps && data.maps.length > 0) {
            data.maps.forEach(map => {
                currentMapImages[map.label.toLowerCase()] = map.img_regular || map.img_small || '';
            });
            const topMaps = data.maps.filter(m => m.mode === '5v5').sort((a, b) => b.stats.Matches - a.stats.Matches).slice(0, 3);
            currentTopMapsStats = topMaps.map(m => ({ name: m.label, wr: m.stats['Win Rate %'], kd: m.stats['Average K/D Ratio'] }));
            
            topMaps.forEach(m => {
                const mapImage = m.img_regular || m.img_small || '';
                mapsContainer.innerHTML += `<div class="map-card">
                    <img class="map-card-image" src="${mapImage}" alt="${m.label}"
                        onerror="this.style.display='none'">
                    <div class="map-card-content">
                        <div class="map-name">${m.label}</div>
                        <div class="map-stats"><span>WR: ${m.stats['Win Rate %']}%</span><span>K/D: ${m.stats['Average K/D Ratio']}</span><span>ADR: ${m.stats.ADR || '-'}</span></div>
                    </div>
                </div>`;
            });
        }

        // --- 6. ГРАФИК ELO ---
        try {
            const historyRes = await fetch(`/api/history/${currentPlayerId}`);
            const historyData = await historyRes.json();
            
            let currentElo = cs2Stats.faceit_elo || 1000;
            let eloHistory = [currentElo];
            let matchLabels = ['Сейчас'];
            
            if (historyData.items && historyData.items.length > 0) {
                historyData.items.forEach((match, index) => {
                    currentElo = match.stats.Result === "1" ? currentElo - 25 : currentElo + 25;
                    eloHistory.unshift(currentElo);
                    matchLabels.unshift(`Матч -${historyData.items.length - index}`);
                });
            }

            document.getElementById('elo-max').textContent = Math.max(...eloHistory);
            document.getElementById('elo-min').textContent = Math.min(...eloHistory);
            
            const eloDiff = eloHistory[eloHistory.length - 1] - eloHistory[0];
            const diffElement = document.getElementById('elo-diff');
            diffElement.textContent = eloDiff > 0 ? `+${eloDiff}` : eloDiff;
            diffElement.style.color = eloDiff >= 0 ? '#d8ff45' : '#ff765f';

            const ctx = document.getElementById('eloChart').getContext('2d');
            if (window.eloChartInstance) window.eloChartInstance.destroy();

            const gradient = ctx.createLinearGradient(0, 0, 0, 250);
            gradient.addColorStop(0, 'rgba(216, 255, 69, 0.3)');
            gradient.addColorStop(1, 'rgba(216, 255, 69, 0)');

            window.eloChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: matchLabels,
                    datasets: [{
                        label: 'ELO',
                        data: eloHistory,
                        borderColor: '#d8ff45',
                        backgroundColor: gradient,
                        borderWidth: 3,
                        pointBackgroundColor: eloHistory.map((e, i) => i === eloHistory.length - 1 ? '#d8ff45' : '#75b9ff'),
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(0,0,0,0.8)', titleColor: '#8b5cf6', bodyFont: { size: 14, weight: 'bold' }, padding: 10, displayColors: false } },
                    scales: { y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: { size: 11 } } }, x: { display: false } },
                    interaction: { intersect: false, mode: 'index' },
                }
            });
        } catch (chartError) {
            console.error("Ошибка загрузки графика:", chartError);
        }

        // --- 7. СБРОС СОСТОЯНИЯ ИИ ---
        document.getElementById('ai-initial-state').classList.remove('hidden');
        document.getElementById('ai-loading-state').classList.add('hidden');
        document.getElementById('ai-result-state').classList.add('hidden');

        showScreen(statsSec);
    } catch (err) {
        errBox.textContent = err.message;
    } finally {
        searchBtn.disabled = false;
        searchBtn.textContent = 'Анализ';
    }
}

// ЗАГРУЗКА ИСТОРИИ МАТЧЕЙ (25 шт)
async function loadHistory() {
    showScreen(historySec);
    const list = document.getElementById('matches-list');
    list.innerHTML = '<div class="loader" style="text-align: center; padding: 20px;">Загрузка истории...</div>';
    
    try {
        const res = await fetch(`/api/history/${currentPlayerId}`);
        const data = await res.json();
        list.innerHTML = '';

        if (!data.items || data.items.length === 0) {
            list.innerHTML = '<p>Матчи не найдены.</p>';
            return;
        }

        data.items.forEach(match => {
            const s = match.stats; 
            const isWin = s.Result === "1";
            let mapName = s.Map || 'Неизвестная карта';
            const rawMatchDate = s['Updated At'] || s['Match Finished At'] || s['Created At'];
            const matchDateValue = typeof rawMatchDate === 'number' || /^\d+$/.test(String(rawMatchDate))
                ? Number(rawMatchDate) * 1000
                : rawMatchDate;
            const parsedMatchDate = new Date(matchDateValue);
            const date = Number.isNaN(parsedMatchDate.getTime())
                ? 'Дата неизвестна'
                : parsedMatchDate.toLocaleDateString('ru-RU');
            const score = s.Score || '- / -';
            const cleanMapName = mapName.replace('de_', '');

            const item = document.createElement('div');
            item.className = `match-item ${isWin ? 'match-win' : 'match-loss'}`;
            
            item.innerHTML = `
                <div class="match-result-block">
                    <span class="match-result-mark">${isWin ? 'W' : 'L'}</span>
                    <span class="match-result-word">${isWin ? 'VICTORY' : 'DEFEAT'}</span>
                </div>
                <div class="match-main-info">
                    <div class="match-map-kicker">MAP / CS2</div>
                    <div class="match-map-name">${cleanMapName}</div>
                    <div class="match-date">${date}</div>
                </div>
                <div class="match-metrics">
                    <span class="match-metric-label">SCORE</span>
                    <strong class="match-score">${score.replace(' / ', ' : ')}</strong>
                    <span class="match-kd">K/D ${s['K/D Ratio'] || '-'}</span>
                </div>
                <span class="match-arrow" aria-hidden="true">↗</span>
            `;
            
            const matchId = s['Match Id'];
            const [score1, score2] = score.split(' / ').map(Number);
            
            item.onclick = () => loadMatchScoreboard(matchId, cleanMapName, { faction1: score1 || 0, faction2: score2 || 0 }, currentMapImages[cleanMapName.toLowerCase()] || '');
            list.appendChild(item);
        });
    } catch (error) {
        list.innerHTML = '<p style="color: #ef4444;">Ошибка при загрузке истории.</p>';
    }
}

// ЗАГРУЗКА ДЕТАЛЬНОГО СКОРБОРДА
async function loadMatchScoreboard(matchId, mapName, score, mapImage = '') {
    showScreen(matchSec);
    document.getElementById('match-map').textContent = mapName;
    document.getElementById('match-score').textContent = `${score.faction1} : ${score.faction2}`;
    const matchImage = document.getElementById('match-map-image');
    matchImage.src = mapImage;
    matchImage.classList.toggle('has-image', Boolean(mapImage));
    
    const container = document.getElementById('scoreboard-container');
    container.innerHTML = '<div class="loader" style="text-align: center;">Загрузка расширенного скорборда...</div>';

    try {
        const res = await fetch(`/api/match/${matchId}`);
        const data = await res.json();
        
        const matchData = data.rounds[0];
        document.getElementById('match-region').textContent = matchData.round_stats?.Region || 'GLOBAL';
        document.getElementById('match-rounds').textContent = `${matchData.round_stats?.Rounds || 0} ROUNDS`;
        document.getElementById('match-mode').textContent = (matchData.game_mode || '5v5').toUpperCase();
        if (!mapImage && matchData.round_stats?.Map) {
            const fallbackImage = currentMapImages[matchData.round_stats.Map.replace('de_', '').toLowerCase()];
            matchImage.src = fallbackImage || '';
            matchImage.classList.toggle('has-image', Boolean(fallbackImage));
        }
        container.innerHTML = '';

        matchData.teams.forEach(team => {
            const isWinner = team.team_stats['Team Win'] === '1';
            const teamKills = team.players.reduce((total, player) => total + (parseInt(player.player_stats.Kills, 10) || 0), 0);
            const teamDeaths = team.players.reduce((total, player) => total + (parseInt(player.player_stats.Deaths, 10) || 0), 0);
            
            let tableHTML = `
                <section class="team-board">
                    <div class="team-title ${isWinner ? 'team-win-title' : 'team-lose-title'}">
                        <span>${team.team_stats.Team} ${isWinner ? '🏆' : ''}</span>
                        <small>${teamKills} K / ${teamDeaths} D</small>
                    </div>
                    <div class="table-responsive">
                    <table class="team-table">
                        <thead>
                            <tr>
                                <th>Игрок</th>
                                <th>Kills</th>
                                <th>Deaths</th>
                                <th>K/D</th>
                                <th>ADR</th>
                                <th>DMG</th>
                                <th>Assists</th>
                                <th>HS %</th>
                                <th>KR</th>
                                <th>ENTRY</th>
                                <th>CLUTCH</th>
                                <th>FLASH</th>
                                <th>MVP</th>
                                <th>3K</th>
                                <th>4K</th>
                                <th>5K</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            const sortedPlayers = team.players.sort((a, b) => b.player_stats.Kills - a.player_stats.Kills);

            sortedPlayers.forEach(p => {
                const stats = p.player_stats;
                const kdRatio = parseFloat(stats['K/D Ratio']);
                const kdClass = kdRatio >= 1 ? 'kd-positive' : 'kd-negative';
                const rowClass = p.nickname === currentNickname ? 'player-row-highlight' : '';

                tableHTML += `
                    <tr class="${rowClass}" data-profile-url="${p.faceit_url || `https://www.faceit.com/en/players/${encodeURIComponent(p.nickname)}`}" data-nickname="${p.nickname}" tabindex="0" role="link">
                        <td class="player-cell"><img class="player-avatar" src="${p.avatar || avatarFallback(p.nickname)}" alt="${p.nickname}"><span>${p.nickname}</span></td>
                        <td>${stats.Kills}</td>
                        <td>${stats.Deaths}</td>
                        <td class="stat-kd ${kdClass}">${stats['K/D Ratio']}</td>
                        <td>${stats.ADR || '-'}</td>
                        <td>${stats.Damage || '-'}</td>
                        <td>${stats.Assists}</td>
                        <td>${stats['Headshots %']}%</td>
                        <td>${stats['K/R Ratio']}</td>
                        <td>${stats['Entry Wins'] || '0'}/${stats['Entry Count'] || '0'}</td>
                        <td>${stats['Clutch Kills'] || '0'}</td>
                        <td>${stats['Flash Successes'] || '0'}</td>
                        <td style="color: #eab308; font-weight: 600;">${stats.MVPs || '0'}</td>
                        <td>${stats['Triple Kills'] || '0'}</td>
                        <td>${stats['Quadro Kills'] || '0'}</td>
                        <td style="color: #ef4444; font-weight: bold;">${stats['Penta Kills'] || '0'}</td>
                    </tr>
                `;
            });

            tableHTML += `</tbody></table></div></section>`;
            container.innerHTML += tableHTML;
        });

        container.querySelectorAll('tr[data-profile-url]').forEach(row => {
            const openProfile = () => openLocalProfile(row.dataset.nickname);
            row.addEventListener('click', openProfile);
            row.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') openProfile();
            });
        });

    } catch (error) {
        container.innerHTML = '<p style="color: #ef4444;">Не удалось загрузить данные матча.</p>';
    }
}

// СЛУШАТЕЛИ СОБЫТИЙ
document.getElementById('search-btn').addEventListener('click', analyze);
document.getElementById('nickname-input').addEventListener('keypress', e => e.key === 'Enter' && analyze());
document.getElementById('back-btn').addEventListener('click', () => showScreen(searchSec));
document.getElementById('view-history-btn').addEventListener('click', loadHistory);
document.getElementById('back-to-stats-btn').addEventListener('click', () => showScreen(statsSec));
document.getElementById('back-to-history-btn').addEventListener('click', () => showScreen(historySec));

// ИИ-ТРЕНЕР
document.getElementById('ai-trigger-btn').addEventListener('click', async () => {
    document.getElementById('ai-initial-state').classList.add('hidden');
    document.getElementById('ai-loading-state').classList.remove('hidden');
    try {
        const aiRes = await fetch('/api/coach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lifetime: currentLifetimeStats, topMaps: currentTopMapsStats })
        });
        const aiData = await aiRes.json();
        document.getElementById('ai-loading-state').classList.add('hidden');
        document.getElementById('ai-result-state').classList.remove('hidden');
        document.getElementById('ai-advice-text').innerHTML = aiData.advice || 'Ошибка ИИ.';
    } catch (error) {
        document.getElementById('ai-loading-state').classList.add('hidden');
        document.getElementById('ai-result-state').classList.remove('hidden');
        document.getElementById('ai-advice-text').innerHTML = 'Связь потеряна.';
    }
});

renderRecentSearches();