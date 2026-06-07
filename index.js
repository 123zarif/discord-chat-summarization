import { Client, Events, GatewayIntentBits, SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const ai = new GoogleGenAI({});

const cooldowns = new Map();
const COOLDOWN_DURATION = 2 * 60 * 1000;

const usageTracker = new Map();
const MAX_USES_PER_DAY = 4;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;


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

        if (!usageTracker.has(userId)) {
            usageTracker.set(userId, []);
        }

        const userRequests = usageTracker.get(userId).filter(timestamp => currentTime - timestamp < ONE_DAY_MS);
        usageTracker.set(userId, userRequests);

        if (userRequests.length >= MAX_USES_PER_DAY) {
            const oldestRequest = userRequests[0];
            const dynamicResetTime = oldestRequest + ONE_DAY_MS;
            const timeLeftMs = dynamicResetTime - currentTime;

            const hoursLeft = Math.floor(timeLeftMs / (60 * 60 * 1000));
            const minutesLeft = Math.ceil((timeLeftMs % (60 * 60 * 1000)) / (60 * 1000));
            const formatTimeString = hoursLeft > 0 ? `${hoursLeft}h ${minutesLeft}m` : `${minutesLeft}m`;

            return await interaction.reply({
                content: `You have reached your limit of **${MAX_USES_PER_DAY}** summaries per day. Your next slot opens up in **${formatTimeString}**.`,
                flags: MessageFlags.Ephemeral
            });
        }

        cooldowns.set(userId, currentTime);
        userRequests.push(currentTime);
        usageTracker.set(userId, userRequests);

        setTimeout(() => {
            if (cooldowns.get(userId) === currentTime) {
                cooldowns.delete(userId);
            }
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

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `
          You are an observant, casual chat assistant for a Discord server. 
          Analyze the chat logs below and write an easy-to-read, natural summary.
          
          CRITICAL SYSTEM DIRECTIVES:
          1. ZERO ROBOTIC FILLER: Do NOT begin with statements like "In this chat transcript..." or "The users discussed...". Dive straight into the information.
          2. SYNTHESIZE: If users repeat the same topic or joke, consolidate them into a single mention.
          3. CAPTURE HUMOR: Organically include sarcasm, jokes, or banter so the server's energy is preserved.
          4. INLINE JUMP LINKS: I have provided a [Link: URL] for every message. Whenever you mention a specific user's action, joke, or quote, you MUST hyperlink your text to their message using standard Markdown. 
             - Example of what to do: "[UserA was confused about the bombing joke](https://discord.com/channels/...)"
             - Never paste raw URLs. Always hide them behind readable text.
          5. LAYOUT: Write in 2 or 3 short, naturally flowing narrative paragraphs. No generic, boring lists.

          Keep the total character count concise so it fits easily into a Discord message.

          --- CHAT LOG HISTORY ---
          ${chatLogString}
          --- END OF LOGS ---
        `,
            });


            const aiSummaryResponse = response.text || "Could not resolve summary.";

            const summaryEmbed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle(`AI Summary of the last ${timeInput} (${allFetchedMessages.length} msgs)`)
                .setDescription(aiSummaryResponse.substring(0, 4096))
                .setFooter({ text: 'Thats all my sweet nigger!' });

            await interaction.editReply({
                content: '',
                embeds: [summaryEmbed]
            });
        } catch (error) {
            console.error('Execution failure inside command:', error);
            await interaction.editReply('Something went sideways while compiling the summary.');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);