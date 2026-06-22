import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { Client as NekosClient } from 'nekos-best.js';
import { updateCount } from '../database/db.js';

const nekos = new NekosClient();

export default {
    data: new SlashCommandBuilder()
        .setName('action')
        .setDescription('Send an anime reaction GIF!')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('The type of action')
                .setRequired(true)
                .addChoices(
                    { name: 'Hug', value: 'hug' }, { name: 'Pat', value: 'pat' },
                    { name: 'Slap', value: 'slap' }, { name: 'Kiss', value: 'kiss' },
                    { name: 'Bite', value: 'bite' }, { name: 'Cuddle', value: 'cuddle' },
                    { name: 'Dance', value: 'dance' }, { name: 'Cry', value: 'cry' },
                    { name: 'Smug', value: 'smug' }, { name: 'Punch', value: 'punch' }
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

        try {
            const response = await nekos.fetch(actionType, 1);
            const gifUrl = response.results[0].url;
            const animeName = response.results[0].anime_name || 'Unknown Anime';

            let description = `**<@${interaction.user.id}>** is expressing **${actionType}**!`;
            let footerText = `Anime: ${animeName}`;
            let components = [];

            const reciprocateActions = ['hug', 'pat', 'slap', 'kiss', 'bite', 'cuddle', 'dance', 'punch'];

            // Note: Keep your large "templates" object here...
            const templates = {
                // ... your existing text templates go here to keep this file clean
                hug: [`💖 **<@{user}>** pulls **<@{target}>** into a warm, cozy hug!`]
            };
            const defaultTemplates = [`✨ **<@{user}>** interacts with **<@{target}>** using **${actionType}**!`];

            const getPastTense = (action) => {
                const irregulars = { hug: 'hugged', slap: 'slapped', kiss: 'kissed', pat: 'patted', bite: 'bitten', cuddle: 'cuddled' };
                return irregulars[action] || `${action}ed`;
            };

            if (targetUser) {
                if (targetUser.id === interaction.user.id) {
                    description = `**<@${interaction.user.id}>** tried to **${actionType}** themselves!`;
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

            // Button Collector logic
            if (components.length > 0) {
                const collector = responseMessage.createMessageComponentCollector({
                    filter: i => i.user.id === targetUser.id,
                    componentType: ComponentType.Button,
                    time: 60000
                });

                collector.on('collect', async i => {
                    await i.deferReply();
                    const returnResponse = await nekos.fetch(actionType, 1);
                    const returnGifUrl = returnResponse.results[0].url;

                    const [u1, u2] = [interaction.user.id, targetUser.id].sort();
                    const result = updateCount.get({ u1, u2, action: actionType });

                    const returnEmbed = new EmbedBuilder()
                        .setColor('#2b2d31')
                        .setDescription(`✨ **<@${targetUser.id}>** returned the ${actionType}!\n*They have ${getPastTense(actionType)} ${result.count} times.*`)
                        .setImage(returnGifUrl)
                        .setFooter({ text: `Anime: ${returnResponse.results[0].anime_name || 'Unknown Anime'}` });

                    await interaction.editReply({ components: [] });
                    await i.editReply({ embeds: [returnEmbed] });
                    collector.stop();
                });

                collector.on('end', collected => {
                    if (collected.size === 0) interaction.editReply({ components: [] }).catch(() => { });
                });
            }

        } catch (error) {
            console.error('API Error:', error);
            await interaction.editReply({ content: 'The anime API is currently acting up! Try again later.' });
        }
    }
};