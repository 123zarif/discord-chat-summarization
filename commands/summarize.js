import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { GoogleGenAI } from '@google/genai';
import { parseTimeToMilliseconds } from '../utils/helpers.js';
import 'dotenv/config';

const ai = new GoogleGenAI({});

// State management for rate limits
const cooldowns = new Map();
const COOLDOWN_DURATION = 2 * 60 * 1000;
const usageTracker = new Map();
const MAX_USES_PER_DAY = 4;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export default {
    data: new SlashCommandBuilder()
        .setName('summarize')
        .setDescription('Summarizes recent chat history within a timeframe')
        .addStringOption(option =>
            option.setName('timeframe')
                .setDescription('Time window to parse (e.g., 30m, 2h, 1d). Default is 1h.')
                .setRequired(false)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const currentTime = Date.now();

        // Cooldown Check
        if (cooldowns.has(userId)) {
            const expirationTime = cooldowns.get(userId) + COOLDOWN_DURATION;
            if (currentTime < expirationTime) {
                const timeLeftSec = Math.ceil((expirationTime - currentTime) / 1000);
                return await interaction.reply({
                    content: `Slow down! You can use this command again in **${timeLeftSec}s**.`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        // Daily Limit Check
        if (!usageTracker.has(userId)) usageTracker.set(userId, []);
        const userRequests = usageTracker.get(userId).filter(timestamp => currentTime - timestamp < ONE_DAY_MS);
        usageTracker.set(userId, userRequests);

        if (userRequests.length >= MAX_USES_PER_DAY) {
            const timeLeftMs = (userRequests[0] + ONE_DAY_MS) - currentTime;
            const hoursLeft = Math.floor(timeLeftMs / (60 * 60 * 1000));
            const minutesLeft = Math.ceil((timeLeftMs % (60 * 60 * 1000)) / (60 * 1000));
            const formatTimeString = hoursLeft > 0 ? `${hoursLeft}h ${minutesLeft}m` : `${minutesLeft}m`;

            return await interaction.reply({
                content: `You have reached your limit of **${MAX_USES_PER_DAY}** summaries per day. Next slot opens in **${formatTimeString}**.`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Apply tracking
        cooldowns.set(userId, currentTime);
        userRequests.push(currentTime);
        usageTracker.set(userId, userRequests);
        setTimeout(() => {
            if (cooldowns.get(userId) === currentTime) cooldowns.delete(userId);
        }, COOLDOWN_DURATION);

        try {
            const timeInput = interaction.options.getString('timeframe') ?? '1h';
            const durationMs = parseTimeToMilliseconds(timeInput);

            if (!durationMs) {
                return await interaction.reply({
                    content: 'Invalid time format! Please use format digits immediately followed by unit (e.g., `45m`, `3h`, `2d`).',
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply();
            const cutoffTimestamp = Date.now() - durationMs;
            let allFetchedMessages = [];
            let lastMessageId = null;
            let keepFetching = true;
            const SAFETY_MAX_MESSAGES = 150;

            // Fetch messages
            while (keepFetching && allFetchedMessages.length < SAFETY_MAX_MESSAGES) {
                const fetchOptions = { limit: 100 };
                if (lastMessageId) fetchOptions.before = lastMessageId;

                const messagesChunk = await interaction.channel.messages.fetch(fetchOptions);
                if (messagesChunk.size === 0) break;

                for (const msg of messagesChunk.values()) {
                    if (msg.createdTimestamp >= cutoffTimestamp) {
                        allFetchedMessages.push(msg);
                    } else {
                        keepFetching = false;
                        break;
                    }
                }
                lastMessageId = messagesChunk.last().id;
            }

            // Format Chat Log
            const chatLogString = allFetchedMessages
                .filter(msg => !msg.author.bot && msg.content.trim().length > 0)
                .map(msg => {
                    let replyTag = "";
                    if (msg.reference && msg.reference.messageId) {
                        const referencedMsg = allFetchedMessages.find(m => m.id === msg.reference.messageId);
                        if (referencedMsg) {
                            const flatContent = referencedMsg.content.replace(/\n/g, " ");
                            const quoted = flatContent.length > 40 ? flatContent.substring(0, 40) + "..." : flatContent;
                            replyTag = ` (Replying to ${referencedMsg.author.username}: "${quoted}")`;
                        } else {
                            replyTag = ` (Replying to an older message)`;
                        }
                    }
                    return `[${msg.author.username}]${replyTag} [Link: ${msg.url}]: ${msg.content}`;
                })
                .reverse()
                .join('\n');

            if (!chatLogString) {
                return await interaction.editReply(`No human text entries found within the last ${timeInput}.`);
            }

            // Call AI
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `You are an observant, casual chat assistant for a Discord server. 
                Analyze the chat logs below and write an easy-to-read, natural summary.
                ... (keep your existing prompt instructions here) ...
                --- CHAT LOG HISTORY ---
                ${chatLogString}
                --- END OF LOGS ---`,
            });

            const aiSummaryResponse = response.text || "Could not resolve summary.";

            const summaryEmbed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle(`AI Summary of the last ${timeInput} (${allFetchedMessages.length} msgs)`)
                .setDescription(aiSummaryResponse.substring(0, 4096))
                .setFooter({ text: 'That is all for now!' });

            await interaction.editReply({ content: '', embeds: [summaryEmbed] });

        } catch (error) {
            console.error('Execution failure inside command:', error);
            await interaction.editReply('Something went sideways while compiling the summary.');
        }
    }
};