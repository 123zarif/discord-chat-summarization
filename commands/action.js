import { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } from 'discord.js';
import { handleAnimeAction } from '../utils/actionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('action')
        .setDescription('Send an anime reaction GIF!')
        .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
        .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
        .addStringOption(option =>
            option.setName('type')
                .setDescription('The type of action')
                .setRequired(true)
                .addChoices(
                    { name: 'Hug', value: 'hug' }, { name: 'Pat', value: 'pat' },
                    { name: 'Slap', value: 'slap' }, { name: 'Kiss', value: 'kiss' },
                    { name: 'Bite', value: 'bite' }, { name: 'Cuddle', value: 'cuddle' },
                    { name: 'Dance', value: 'dance' }, { name: 'Cry', value: 'cry' },
                    { name: 'Smug', value: 'smug' }, { name: 'Punch', value: 'punch' },
                    { name: 'Kick', value: 'kick' }, { name: 'Yeet', value: 'yeet' },
                    { name: 'Poke', value: 'poke' }, { name: 'High-Five', value: 'highfive' },
                    { name: 'Pout', value: 'pout' }, { name: 'Angry', value: 'angry' }
                )
        )
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user you want to target (optional)')
                .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply();
        const actionType = interaction.options.getString('type');
        const targetUser = interaction.options.getUser('target');

        await handleAnimeAction(interaction, actionType, targetUser);
    }
};