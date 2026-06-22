import { Events } from 'discord.js';
import { startArgentinaTracker } from '../services/argentinaTracker.js';
import 'dotenv/config';

export default {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`⚡ Bot is locked and loaded! Logged in as ${client.user.tag}`);

        try {
            const guild = client.guilds.cache.get(process.env.GUILD_ID);
            if (guild) {
                const commandData = client.commands.map(cmd => cmd.data);
                await guild.commands.set(commandData);
                console.log(`Slash commands deployed instantly to: ${guild.name}`);
            } else {
                console.log('Could not find the server. Check your GUILD_ID in your .env file!');
            }
        } catch (error) {
            console.error('Error deploying slash commands:', error);
        }

        startArgentinaTracker(client);
    }
};