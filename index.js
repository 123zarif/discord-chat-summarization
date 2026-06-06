import { Client, Events, GatewayIntentBits, SlashCommandBuilder } from 'discord.js';
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

client.once(Events.ClientReady, async (readyClient) => {
    console.log(`⚡ Bot is locked and loaded! Logged in as ${readyClient.user.tag}`);

    const summarizeCommand = new SlashCommandBuilder()
        .setName('summarize')
        .setDescription('Fetches and summarizes recent chat history using Gemini AI')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('How many messages to read (Default: 20, Max: 250)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(250)
        );

    try {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);

        if (guild) {
            await guild.commands.set([summarizeCommand]);
            console.log(`✅ Slash commands deployed instantly to: ${guild.name}`);
        } else {
            console.log('❌ Could not find the server. Check your GUILD_ID in your .env file!');
        }
    } catch (error) {
        console.error('Error deploying slash commands:', error);
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'summarize') {

        await interaction.deferReply();

        try {
            const amountToFetch = interaction.options.getInteger('amount') ?? 20;

            const fetchedMessages = await interaction.channel.messages.fetch({ limit: amountToFetch });

            const chatLogString = fetchedMessages
                .filter(msg => !msg.author.bot)
                .map(msg => `[${msg.author.username}]: ${msg.content}`)
                .reverse()
                .join('\n');

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `
          You are a helpful assistant embedded in a friend group's Discord server. 
          Your job is to read this chat log transcript and write a super concise summary.
          Highlight key conversation topics, inside jokes, decisions, or plans made.
          Keep your total response formatting clean and under 1500 characters so it fits neatly in a Discord message.

          --- CHAT LOG HISTORY ---
          ${chatLogString}
          --- END OF LOGS ---
        `,
            });

            const finalReply = `${response.text}`;
            await interaction.editReply(finalReply);
        } catch (error) {
            console.error('Execution failure inside command:', error);
            await interaction.editReply('Something went sideways while compiling the summary.');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);