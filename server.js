require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 1. Поиск игрока и глобальной статы
app.get('/api/player/:nickname', async (req, res) => {
    try {
        const nickname = req.params.nickname;
        const playerRes = await axios.get(`https://open.faceit.com/data/v4/players?nickname=${nickname}`, {
            headers: { Authorization: `Bearer ${process.env.FACEIT_API_KEY}` }
        });
        const playerId = playerRes.data.player_id;

        const statsRes = await axios.get(`https://open.faceit.com/data/v4/players/${playerId}/stats/cs2`, {
            headers: { Authorization: `Bearer ${process.env.FACEIT_API_KEY}` }
        });

        res.json({
            player: playerRes.data,
            lifetime: statsRes.data.lifetime,
            maps: statsRes.data.segments
        });
    } catch (error) {
        res.status(404).json({ error: 'Игрок не найден' });
    }
});

// 2. ИИ-Тренер
app.post('/api/coach', async (req, res) => {
    try {
        const { lifetime, topMaps } = req.body;
        const prompt = `Ты киберспортивный аналитик CS2. Стата игрока: Общее: ${JSON.stringify(lifetime)}. Топ карты: ${JSON.stringify(topMaps)}. Дай 3 жестких совета. Форматируй HTML тегами <b> и <ul><li>. Без воды.`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-flash-lite-latest',
            contents: prompt,
        });
        res.json({ advice: response.text });
    } catch (error) {
        res.status(500).json({ error: 'Тренер недоступен.' });
    }
});

// 3. НОВОЕ: Получение истории 25 матчей (по ID игрока)
app.get('/api/history/:playerId', async (req, res) => {
    try {
        const { playerId } = req.params;
        // Перешли на эндпоинт stats, он отдает детальные данные по каждому матчу
        const historyRes = await axios.get(`https://open.faceit.com/data/v4/players/${playerId}/games/cs2/stats?offset=0&limit=25`, {
            headers: { Authorization: `Bearer ${process.env.FACEIT_API_KEY}` }
        });
        res.json(historyRes.data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка загрузки истории' });
    }
});

// 4. НОВОЕ: Получение скорборда конкретного матча
app.get('/api/match/:matchId', async (req, res) => {
    try {
        const { matchId } = req.params;
        const matchRes = await axios.get(`https://open.faceit.com/data/v4/matches/${matchId}/stats`, {
            headers: { Authorization: `Bearer ${process.env.FACEIT_API_KEY}` }
        });
        const matchData = matchRes.data;
        const headers = { Authorization: `Bearer ${process.env.FACEIT_API_KEY}` };
        const players = matchData.rounds?.[0]?.teams?.flatMap(team => team.players || []) || [];
        const enrichedPlayers = await Promise.all(players.map(async player => {
            try {
                const playerRes = await axios.get(`https://open.faceit.com/data/v4/players/${player.player_id}`, { headers });
                return {
                    ...player,
                    avatar: playerRes.data.avatar || '',
                    faceit_url: playerRes.data.faceit_url || `https://www.faceit.com/en/players/${encodeURIComponent(player.nickname)}`
                };
            } catch (error) {
                return {
                    ...player,
                    avatar: '',
                    faceit_url: `https://www.faceit.com/en/players/${encodeURIComponent(player.nickname)}`
                };
            }
        }));
        const playerById = new Map(enrichedPlayers.map(player => [player.player_id, player]));
        matchData.rounds?.[0]?.teams?.forEach(team => {
            team.players = (team.players || []).map(player => playerById.get(player.player_id) || player);
        });
        res.json(matchData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка загрузки матча' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 EloPilot v2 (Match History) запущен на порту ${PORT}`));