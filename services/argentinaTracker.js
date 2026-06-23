import { EmbedBuilder } from 'discord.js';
import 'dotenv/config';

let currentGoals = 0;
let isInitialized = false;

const ARGENTINA_TEAM_ID = 762;

const CELEBRATIONS = [
    'https://media.tenor.com/Hj6XF5odPpEAAAAC/messi-argentina.gif',
    'https://media.tenor.com/KRR4JTnXrP4AAAAd/messi-barcelona.gif',
];

export async function startArgentinaTracker(client) {
    const API_KEY = process.env.FOOTBALL_API_KEY;
    const CHANNEL_ID = process.env.ALERT_CHANNEL_ID;

    if (!API_KEY || !CHANNEL_ID) {
        console.log('⚠️ [WARNING] Missing API Key or Channel ID in .env. Tracker disabled.');
        return;
    }

    console.log('🇦🇷 Starting Argentina Goal Tracker...');

    checkScore(client, API_KEY, CHANNEL_ID);
    setInterval(() => checkScore(client, API_KEY, CHANNEL_ID), 10000);
}

async function checkScore(client, apiKey, channelId) {
    try {
        const response = await fetch(`https://api.football-data.org/v4/teams/${ARGENTINA_TEAM_ID}/matches?status=IN_PLAY`, {
            headers: { 'X-Auth-Token': apiKey }
        });

        const data = await response.json();

        if (!data || !data.matches || data.matches.length === 0) {
            isInitialized = false;
            currentGoals = 0;
            return;
        }

        const match = data.matches[0];
        const isHome = match.homeTeam.id === ARGENTINA_TEAM_ID;
        const liveGoals = isHome ? match.score.fullTime.home : match.score.fullTime.away;

        if (!isInitialized) {
            currentGoals = liveGoals;
            isInitialized = true;
            return;
        }

        if (liveGoals > currentGoals) {
            currentGoals = liveGoals;

            const channel = await client.channels.fetch(channelId);
            if (channel) {
                const randomCelebration = CELEBRATIONS[Math.floor(Math.random() * CELEBRATIONS.length)];

                const goalEmbed = new EmbedBuilder()
                    .setColor('#43A1D5')
                    .setTitle('🚨 GOOOOOAL FOR ARGENTINA! 🇦🇷')
                    .setDescription(`Argentina just scored their **${liveGoals}** goal of the match.`)
                    .addFields(
                        { name: '🇦🇷 ' + match.homeTeam.name, value: `**${match.score.fullTime.home}**`, inline: true },
                        { name: '🇦🇹 ' + match.awayTeam.name, value: `**${match.score.fullTime.away}**`, inline: true }
                    )
                    .setThumbnail('https://crests.football-data.org/762.png')
                    .setImage(randomCelebration)
                    .setTimestamp();

                await channel.send({ embeds: [goalEmbed] });
            }
        }

    } catch (error) {
        console.error("Tracker API Error:", error);
    }
}


