import { Client, Events, GatewayIntentBits, SlashCommandBuilder, MessageFlags } from 'discord.js';
import OpenAI from "openai";
import 'dotenv/config';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const client_ai = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});

const cooldowns = new Map();
const COOLDOWN_DURATION = 2 * 60 * 1000;


function parseTimeToMilliseconds(timeStr) {
    const match = timeStr.toLowerCase().match(/^(\d+)([mhd])$/);
    if (!match) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const unitMultipliers = {
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
    };

    return value * unitMultipliers[unit];
}

client.once(Events.ClientReady, async (readyClient) => {
    console.log(`⚡ Bot is locked and loaded! Logged in as ${readyClient.user.tag}`);

    const summarizeCommand = new SlashCommandBuilder()
        .setName('summarize')
        .setDescription('Summarizes recent chat history within a timeframe')
        .addStringOption(option =>
            option.setName('timeframe')
                .setDescription('Time window to parse (e.g., 30m, 2h, 1d). Default is 1h.')
                .setRequired(false)
        );

    try {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);

        if (guild) {
            await guild.commands.set([summarizeCommand]);
            console.log(`Slash commands deployed instantly to: ${guild.name}`);
        } else {
            console.log('Could not find the server. Check your GUILD_ID in your .env file!');
        }
    } catch (error) {
        console.error('Error deploying slash commands:', error);
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'summarize') {
        const userId = interaction.user.id;
        const currentTime = Date.now();

        if (cooldowns.has(userId)) {
            const expirationTime = cooldowns.get(userId) + COOLDOWN_DURATION;

            if (currentTime < expirationTime) {
                const timeLeftMs = expirationTime - currentTime;
                const timeLeftSec = Math.ceil(timeLeftMs / 1000);

                return await interaction.reply({
                    content: `Slow down! You can use this command again in **${timeLeftSec}s**.`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        cooldowns.set(userId, currentTime);

        setTimeout(() => cooldowns.delete(userId), COOLDOWN_DURATION);



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

            while (keepFetching && allFetchedMessages.length < SAFETY_MAX_MESSAGES) {
                const fetchOptions = { limit: 100 };
                if (lastMessageId) {
                    fetchOptions.before = lastMessageId;
                }

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

            const chatLogString = allFetchedMessages
                .filter(msg => !msg.author.bot && msg.content.trim().length > 0)
                .map(msg => {
                    let replyTag = "";

                    if (msg.reference && msg.reference.messageId) {
                        const referencedMsg = allFetchedMessages.find(m => m.id === msg.reference.messageId);

                        if (referencedMsg) {
                            const flatContent = referencedMsg.content.replace(/\n/g, " ");

                            const quotedContent = flatContent.length > 40
                                ? flatContent.substring(0, 40) + "..."
                                : flatContent;

                            replyTag = ` (Replying to ${referencedMsg.author.username}: "${quotedContent}")`;
                        } else {
                            replyTag = ` (Replying to an older message outside this timeframe)`;
                        }
                    }

                    return `[${msg.author.username}]${replyTag}: ${msg.content}`;
                })
                .reverse()
                .join('\n');

            if (!chatLogString) {
                return await interaction.editReply(`No human text entries found within the last ${timeInput}.`);
            }
            const completion = await client_ai.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `
You are a helpful Discord bot. Review the chat transcript and provide a clear, comprehensive summary that reads naturally and skips conversational filler.

GUIDELINES:
- **Coverage**: You must mention every distinct topic discussed in the log.
- **People**: Explicitly attribute actions, questions, and decisions to the specific users who said them.
- **Formatting**: Use clean spacing, bold names, and clear section dividers instead of a giant wall of bullet points. Make it incredibly easy to read at a single glance.
- **ZERO FILLER**: Do NOT use introductory sentences (e.g., "In this chat...", "Here is the summary"). Do NOT write concluding paragraphs (e.g., "In summary...", "Overall..."). Start immediately with the facts.

Ensure the entire output stays under 1500 characters to prevent Discord truncation.
`                    },
                    {
                        role: "user",
                        content: `--- TRANSCRIPT TIMEFRAME: ${timeInput} ---\n${chatLogString}`
                    }
                ],
                // model: "meta-llama/llama-4-scout-17b-16e-instruct",
                model: "allam-2-7b",
                temperature: 0.3,
            });

            const aiSummaryResponse = completion.choices[0]?.message?.content || "Could not resolve summary.";

            await interaction.editReply(`**AI Summary of the last ${timeInput} (${allFetchedMessages.length} messages parsed):**\n\n${aiSummaryResponse}`);

        } catch (error) {
            console.error('Execution failure inside command:', error);
            await interaction.editReply('Something went sideways while compiling the summary.');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);