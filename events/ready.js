import { Events } from 'discord.js';
import 'dotenv/config';

export default {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`⚡ Bot is locked and loaded! Logged in as ${client.user.tag}`);

        try {
            const commandData = client.commands.map(cmd => cmd.data);

            await client.application.commands.set(commandData);

            console.log(`🌍 Slash commands successfully deployed globally!`);
        } catch (error) {
            console.error('Error deploying global slash commands:', error);
        }
    }
};