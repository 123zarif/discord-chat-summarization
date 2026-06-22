import { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } from 'discord.js';
import { handleAnimeAction } from '../utils/actionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('kc')
        .setDescription('Shortcut to quickly kiss a kiss to CaptainCheese !')
        .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
        .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),

    async execute(interaction) {
        await interaction.deferReply();
        const targetUser = await interaction.client.users.fetch('759834538448388206');
        await handleAnimeAction(interaction, 'kiss', targetUser);
    }
};