import { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } from 'discord.js';
import { handleAnimeAction } from '../utils/actionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('km')
        .setDescription('Shortcut to quickly kiss a kiss to MacInTheSeas!')
        .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
        .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),

    async execute(interaction) {
        await interaction.deferReply();
        const targetUser = await interaction.client.users.fetch('790510722047410208');

        await handleAnimeAction(interaction, 'kiss', targetUser);
    }
};