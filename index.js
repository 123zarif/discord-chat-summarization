import {
    Client,
    Events,
    GatewayIntentBits,
    SlashCommandBuilder,
    MessageFlags,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} from 'discord.js';
import { GoogleGenAI } from '@google/genai';
import { Client as NekosClient } from 'nekos-best.js';
import Database from 'better-sqlite3';
import 'dotenv/config';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const db = new Database('bot_data.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS action_counts (
    user1_id TEXT,
    user2_id TEXT,
    action_type TEXT,
    count INTEGER,
    PRIMARY KEY (user1_id, user2_id, action_type)
  )
`);

const getCount = db.prepare('SELECT count FROM action_counts WHERE user1_id = ? AND user2_id = ? AND action_type = ?');
const updateCount = db.prepare('INSERT INTO action_counts (user1_id, user2_id, action_type, count) VALUES (@u1, @u2, @action, 1) ON CONFLICT(user1_id, user2_id, action_type) DO UPDATE SET count = count + 1 RETURNING count');

const ai = new GoogleGenAI({});
const nekos = new NekosClient();

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

    const actionCommand = new SlashCommandBuilder()
        .setName('action')
        .setDescription('Send an anime reaction GIF!')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('The type of action')
                .setRequired(true)
                .addChoices(
                    { name: 'Hug', value: 'hug' },
                    { name: 'Pat', value: 'pat' },
                    { name: 'Slap', value: 'slap' },
                    { name: 'Kiss', value: 'kiss' },
                    { name: 'Bite', value: 'bite' },
                    { name: 'Cuddle', value: 'cuddle' },
                    { name: 'Dance', value: 'dance' },
                    { name: 'Cry', value: 'cry' },
                    { name: 'Smug', value: 'smug' },
                    { name: 'Punch', value: 'punch' }
                )
        )
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user you want to target (optional)')
                .setRequired(false)
        );

    try {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);

        if (guild) {
            await guild.commands.set([summarizeCommand, actionCommand]);
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

    if (interaction.commandName === 'action') {
        await interaction.deferReply();

        const actionType = interaction.options.getString('type');
        const targetUser = interaction.options.getUser('target');

        try {
            const response = await nekos.fetch(actionType, 1);
            const gifUrl = response.results[0].url;
            const animeName = response.results[0].anime_name || 'Unknown Anime';

            let description = `**<@${interaction.user.id}>** is expressing **${actionType}**!`;
            let footerText = `Anime: ${animeName}`;
            let components = [];

            const reciprocateActions = ['hug', 'pat', 'slap', 'kiss', 'bite', 'cuddle', 'dance', 'punch'];

            const templates = {
                hug: [
                    `💖 **<@{user}>** pulls **<@{target}>** into a warm, cozy hug!`,
                    `✨ **<@{user}>** runs over and tackles **<@{target}>** with a giant bear hug!`,
                    `🌸 **<@{user}>** gives **<@{target}>** a soft, comforting squeeze.`
                ],
                pat: [
                    `👋 **<@{user}>** gently pats **<@{target}>** on the head. Good boy/girl!`,
                    `✨ *pat pat* **<@{user}>** is showering **<@{target}>** with headpats!`,
                    `🐱 **<@{user}>** softly strokes **<@{target}>**'s hair.`
                ],
                slap: [
                    `💥 **<@{user}>** completely flattens **<@{target}>** with a massive slap! Ouch!`,
                    `💢 *SMACK!* **<@{user}>** slapped **<@{target}>**! What did they even do?!`,
                    `🙄 **<@{user}>** couldn't handle the nonsense and slapped **<@{target}>**.`
                ],
                kiss: [
                    `✨ **<@{user}>** plants a sweet, loving kiss on **<@{target}>**!`,
                    `💕 **<@{user}>** sneaks up and gives **<@{target}>** a soft chuu~!`,
                    `👉👈 **<@{user}>** blushes deeply and kisses **<@{target}>**.`
                ],
                bite: [
                    `🦈 **<@{user}>** takes a sneaky little chomp out of **<@{target}>**!`,
                    `😈 *Nom!* **<@{user}>** nibbles on **<@{target}>** aggressively.`,
                    `💢 **<@{user}>** got annoyed and bit **<@{target}>**!`
                ],
                cuddle: [
                    `🧸 **<@{user}>** snuggles up close next to **<@{target}>**! Cozy vibes.`,
                    `💤 **<@{user}>** and **<@{target}>** are completely tangled up cuddling together.`,
                    `🌸 **<@{user}>** demands cuddles and clings onto **<@{target}>**!`
                ],
                dance: [
                    `💃 **<@{user}>** grabs **<@{target}>** by the hands and spins them around!`,
                    `🎵 **<@{user}>** and **<@{target}>** are grooving to the beat together!`,
                    `✨ **<@{user}>** does a silly little victory dance right in front of **<@{target}>**.`
                ],
                cry: [
                    `😭 **<@{user}>** is sobbing uncontrollably all over **<@{target}>**!`,
                    `💧 **<@{user}>** runs to **<@{target}>** looking for comfort while crying.`,
                    `🥺 **<@{user}>** is shedding soft anime tears right next to **<@{target}>**.`
                ],
                punch: [
                    `👊 **<@{user}>** sends **<@{target}>** flying into orbit with a massive punch!`,
                    `💥 *POW!* **<@{user}>** delivers a swift right hook to **<@{target}>**!`,
                    `💢 **<@{user}>** throwing hands! **<@{target}>** got punched!`
                ]
            };

            const defaultTemplates = [
                `✨ **<@{user}>** interacts with **<@{target}>** using **${actionType}**!`,
                `🌟 **<@{user}>** performs a dynamic **${actionType}** on **<@{target}>**!`
            ];

            const getPastTense = (action) => {
                const irregulars = { hug: 'hugged', slap: 'slapped', kiss: 'kissed', pat: 'patted', bite: 'bitten', cuddle: 'cuddled' };
                return irregulars[action] || `${action}ed`;
            };

            if (targetUser) {
                if (targetUser.id === interaction.user.id) {
                    const selfTemplates = [
                        `**<@${interaction.user.id}>** is giving themselves a **${actionType}**... kinda weird but okay.`,
                        `**<@${interaction.user.id}>** tried to **${actionType}** themselves! Loneliness level: 100.`
                    ];
                    description = selfTemplates[Math.floor(Math.random() * selfTemplates.length)];
                } else {
                    const [u1, u2] = [interaction.user.id, targetUser.id].sort();
                    const result = updateCount.get({ u1, u2, action: actionType });

                    const actionPool = templates[actionType] || defaultTemplates;
                    const mainText = actionPool[Math.floor(Math.random() * actionPool.length)]
                        .replace('{user}', interaction.user.id)
                        .replace('{target}', targetUser.id);

                    description = `${mainText}\n*! <@${interaction.user.id}> and <@${targetUser.id}> have ${getPastTense(actionType)} ${result.count} times.*`;

                    if (reciprocateActions.includes(actionType) && !targetUser.bot) {
                        const backButton = new ButtonBuilder()
                            .setCustomId(`return_${actionType}_${interaction.user.id}`)
                            .setLabel(`${actionType.charAt(0).toUpperCase() + actionType.slice(1)} back!`)
                            .setStyle(ButtonStyle.Primary);

                        components = [new ActionRowBuilder().addComponents(backButton)];
                    }
                }
            }

            const actionEmbed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setDescription(description)
                .setImage(gifUrl)
                .setFooter({ text: footerText });

            const responseMessage = await interaction.editReply({ embeds: [actionEmbed], components });

            if (components.length > 0) {
                const collectorFilter = i => i.user.id === targetUser.id;

                const collector = responseMessage.createMessageComponentCollector({
                    filter: collectorFilter,
                    componentType: ComponentType.Button,
                    time: 60000
                });

                collector.on('collect', async i => {
                    await i.deferReply();

                    const returnResponse = await nekos.fetch(actionType, 1);
                    const returnGifUrl = returnResponse.results[0].url;

                    const [u1, u2] = [interaction.user.id, targetUser.id].sort();
                    const result = updateCount.get({ u1, u2, action: actionType });

                    const actionPool = templates[actionType] || defaultTemplates;
                    const returnMainText = actionPool[Math.floor(Math.random() * actionPool.length)]
                        .replace('{user}', targetUser.id)
                        .replace('{target}', interaction.user.id);

                    const returnDesc = `${returnMainText}\n*! <@${targetUser.id}> and <@${interaction.user.id}> have ${getPastTense(actionType)} ${result.count} times.*`;

                    const returnEmbed = new EmbedBuilder()
                        .setColor('#2b2d31')
                        .setDescription(returnDesc)
                        .setImage(returnGifUrl)
                        .setFooter({ text: `Anime: ${returnResponse.results[0].anime_name || 'Unknown Anime'}` });

                    await interaction.editReply({ components: [] });

                    await i.editReply({ embeds: [returnEmbed] });
                    collector.stop();
                });

                collector.on('end', collected => {
                    if (collected.size === 0) {
                        interaction.editReply({ components: [] }).catch(() => { });
                    }
                });
            }

        } catch (error) {
            console.error('Failed to fetch from nekos-best.js or database:', error);
            await interaction.editReply({ content: 'The anime API is currently acting up! Try again later.', embeds: [], components: [] });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);