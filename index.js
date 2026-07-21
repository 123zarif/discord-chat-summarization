import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import util from 'node:util';
import { Client, GatewayIntentBits, Collection, AttachmentBuilder } from 'discord.js';
import express from 'express';
import 'dotenv/config';

const execPromise = util.promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const TARGET_CHANNEL_ID = process.env.INSTAGRAM_TARGET_CHANNEL_ID;


app.get('/webhook', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
        console.log('Meta Webhook successfully verified and linked!');
        return res.status(200).send(req.query['hub.challenge']);
    }
    res.sendStatus(403);
});


app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'instagram') {
        try {
            for (let entry of body.entry) {
                const messagingEvent = entry.messaging?.[0];

                if (messagingEvent && messagingEvent.message) {
                    const messageText = messagingEvent.message.text || '';

                    if (messageText.includes('instagram.com/reel/')) {
                        console.log(`Reel: ${messageText}`);

                        const userMap = {
                            "17843602760913614": "Zarif_1020",
                        };

                        const senderName = userMap[senderId] || `User_${senderId.slice(-4)}`;

                        const channel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
                        if (channel && channel.isTextBased()) {
                            const outputFilePath = path.join(__dirname, `temp_reel_${Date.now()}.mp4`);
                            const cookiesPath = path.join(__dirname, 'cookies.txt');

                            console.log('Downloading reel media via yt-dlp...');
                            await execPromise(`yt-dlp --cookies "${cookiesPath}" -o "${outputFilePath}" "${messageText}"`);

                            const stats = fs.statSync(outputFilePath);
                            const fileSizeInMB = stats.size / (1024 * 1024);

                            if (fileSizeInMB > 25) {
                                await channel.send(`**New Instagram Reel (Too large to upload directly):**\n${messageText}`);
                                console.log('Reel file too large for Discord, sent link instead.');
                            } else {
                                const attachment = new AttachmentBuilder(outputFilePath, { name: 'reel.mp4' });
                                await channel.send({
                                    content: `📥 **New Instagram Reel from @${senderName}:**`,
                                    files: [attachment]
                                });
                                console.log(`Uploaded reel video file to Discord channel ${TARGET_CHANNEL_ID}`);
                            }

                            if (fs.existsSync(outputFilePath)) {
                                fs.unlinkSync(outputFilePath);
                            }
                        } else {
                            console.error(`Could not find or access Discord channel with ID: ${TARGET_CHANNEL_ID}`);
                        }
                    }
                }
            }
            return res.status(200).send('EVENT_RECEIVED');
        } catch (error) {
            console.error(' Webhook pipeline processing error:', error.message);
            return res.sendStatus(500);
        }
    }
    res.sendStatus(404);
});

app.listen(PORT, () => console.log(`🚀 Webhook gateway monitoring inbound data on port ${PORT}`));


// Create a Collection to store commands
client.commands = new Collection();

// 1. Dynamically load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = `file://${path.join(commandsPath, file)}`;
    const { default: command } = await import(filePath);

    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// 2. Dynamically load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = `file://${path.join(eventsPath, file)}`;
    const { default: event } = await import(filePath);

    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
}

client.login(process.env.DISCORD_TOKEN);

