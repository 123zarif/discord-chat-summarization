import { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('random')
        .setDescription('Generates a random number within a specific range')
        .setIntegrationTypes(
            ApplicationIntegrationType.GuildInstall,
            ApplicationIntegrationType.UserInstall
        )
        .setContexts(
            InteractionContextType.Guild,
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel
        )
        .addIntegerOption(option =>
            option.setName('from')
                .setDescription('The minimum number')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('to')
                .setDescription('The maximum number')
                .setRequired(true)
        ),

    async execute(interaction) {
        let from = interaction.options.getInteger('from');
        let to = interaction.options.getInteger('to');

        if (from > to) {
            const temp = from;
            from = to;
            to = temp;
        }

        const randomNumber = Math.floor(Math.random() * (to - from + 1)) + from;

        await interaction.reply({
            content: `Your random number between **${from}** and **${to}** is: **${randomNumber}**`
        });
    }
};