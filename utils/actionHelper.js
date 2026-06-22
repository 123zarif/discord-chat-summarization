import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { Client as NekosClient } from 'nekos-best.js';
import { updateCount } from '../database/db.js';

const nekos = new NekosClient();

export async function handleAnimeAction(interaction, actionType, targetUser) {
    try {
        const response = await nekos.fetch(actionType, 1);
        const gifUrl = response.results[0].url;
        const animeName = response.results[0].anime_name || 'Unknown Anime';

        let description = `**<@${interaction.user.id}>** is expressing **${actionType}**!`;
        let components = [];

        const reciprocateActions = ['hug', 'pat', 'slap', 'kiss', 'bite', 'cuddle', 'dance', 'punch', 'kick', 'yeet', 'poke', 'highfive'];

        const templates = {
            hug: [`💖 **<@{user}>** pulls **<@{target}>** into a warm, cozy hug!`, `✨ **<@{user}>** runs over and tackles **<@{target}>** with a giant bear hug!`],
            pat: [`👋 **<@{user}>** gently pats **<@{target}>** on the head.`, `✨ *pat pat* **<@{user}>** is showering **<@{target}>** with headpats!`],
            slap: [`💥 **<@{user}>** completely flattens **<@{target}>** with a massive slap! Ouch!`, `💢 *SMACK!* **<@{user}>** slapped **<@{target}>**!`],
            kiss: [`✨ **<@{user}>** plants a sweet, loving kiss on **<@{target}>**!`, `💕 **<@{user}>** sneaks up and gives **<@{target}>** a soft chuu~!`],
            bite: [`🦈 **<@{user}>** takes a sneaky little chomp out of **<@{target}>**!`, `😈 *Nom!* **<@{user}>** nibbles on **<@{target}>** aggressively.`],
            cuddle: [`🧸 **<@{user}>** snuggles up close next to **<@{target}>**!`, `💤 **<@{user}>** and **<@{target}>** are completely tangled up cuddling.`],
            dance: [`💃 **<@{user}>** grabs **<@{target}>** by the hands and spins them around!`, `🎵 **<@{user}>** and **<@{target}>** are grooving to the beat together!`],
            cry: [`😭 **<@{user}>** is sobbing uncontrollably all over **<@{target}>**!`, `🥺 **<@{user}>** runs to **<@{target}>** for comfort.`],
            punch: [`👊 **<@{user}>** sends **<@{target}>** flying into orbit with a massive punch!`, `💥 *POW!* **<@{user}>** delivers a swift right hook to **<@{target}>**!`],
            kick: [`👢 **<@{user}>** delivers a swift kick to **<@{target}>**!`, `💥 **<@{target}>** gets kicked across the room by **<@{user}>**!`],
            yeet: [`🚀 **<@{user}>** completely yeets **<@{target}>** into the stratosphere!`, `🗑️ **<@{user}>** throws **<@{target}>** away! YEET!`],
            poke: [`👉 **<@{user}>** pokes **<@{target}>** annoyingly.`, `✨ **<@{user}>** gently pokes **<@{target}>** on the cheek.`],
            highfive: [`🙏 **<@{user}>** and **<@{target}>** share an epic high-five!`, `✨ **<@{user}>** gives **<@{target}>** a crisp high-five!`],
            pout: [`🥺 **<@{user}>** puffs their cheeks and pouts at **<@{target}>**!`, `💢 **<@{user}>** is pouting at **<@{target}>**. Pay attention to them!`],
            angry: [`🤬 **<@{user}>** is furiously yelling at **<@{target}>**!`, `💢 **<@{user}>** glares daggers at **<@{target}>** in pure rage!`]
        };

        const defaultTemplates = [`✨ **<@{user}>** interacts with **<@{target}>** using **${actionType}**!`];

        const getPastTense = (action) => {
            const irregulars = { hug: 'hugged', slap: 'slapped', kiss: 'kissed', pat: 'patted', bite: 'bitten', cuddle: 'cuddled', poke: 'poked', highfive: 'high-fived', pout: 'pouted at', angry: 'got angry at' };
            return irregulars[action] || `${action}ed`;
        };

        if (targetUser) {
            if (targetUser.id === interaction.user.id) {
                description = `**<@${interaction.user.id}>** tried to **${actionType}** themselves! Loneliness level: 100.`;
            } else {
                const [u1, u2] = [interaction.user.id, targetUser.id].sort();
                const result = updateCount.get({ u1, u2, action: actionType });

                const actionPool = templates[actionType] || defaultTemplates;
                const mainText = actionPool[Math.floor(Math.random() * actionPool.length)]
                    .replace('{user}', interaction.user.id)
                    .replace('{target}', targetUser.id);

                description = `${mainText}\n*! <@${interaction.user.id}> and <@${targetUser.id}> have ${getPastTense(actionType)} ${result.count} times.*`;

                if (reciprocateActions.includes(actionType) && !targetUser.bot) {
                    const row = new ActionRowBuilder();

                    const backButton = new ButtonBuilder()
                        .setCustomId(`return_${actionType}_${interaction.user.id}`)
                        .setLabel(`${actionType.charAt(0).toUpperCase() + actionType.slice(1)} back!`)
                        .setStyle(ButtonStyle.Primary);

                    row.addComponents(backButton);

                    if (actionType === 'kiss') {
                        const rejectButton = new ButtonBuilder()
                            .setCustomId(`reject_kiss_${interaction.user.id}`)
                            .setLabel('Reject')
                            .setStyle(ButtonStyle.Danger);
                        row.addComponents(rejectButton);
                    }

                    components = [row];
                }
            }
        }

        const actionEmbed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setDescription(description)
            .setImage(gifUrl)
            .setFooter({ text: `Anime: ${animeName}` });

        const responseMessage = await interaction.editReply({ embeds: [actionEmbed], components });

        // Collector logic
        if (components.length > 0) {
            const collector = responseMessage.createMessageComponentCollector({
                filter: i => i.user.id === targetUser.id,
                componentType: ComponentType.Button,
                time: 60000
            });

            collector.on('collect', async i => {
                await i.deferReply();

                if (i.customId.startsWith('reject_')) {
                    const rejectResponse = await nekos.fetch('nope', 1);

                    const rejectEmbed = new EmbedBuilder()
                        .setColor('#ED4245')
                        .setDescription(`💔 **<@${targetUser.id}>** violently rejected **<@${interaction.user.id}>**'s kiss! DENIED!`)
                        .setImage(rejectResponse.results[0].url)
                        .setFooter({ text: `Anime: ${rejectResponse.results[0].anime_name || 'Unknown Anime'}` });

                    await interaction.editReply({ components: [] });
                    await i.editReply({ embeds: [rejectEmbed] });
                    collector.stop();
                    return;
                }

                const returnResponse = await nekos.fetch(actionType, 1);
                const [u1, u2] = [interaction.user.id, targetUser.id].sort();
                const result = updateCount.get({ u1, u2, action: actionType });

                const returnEmbed = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setDescription(`✨ **<@${targetUser.id}>** returned the ${actionType}!\n*They have ${getPastTense(actionType)} ${result.count} times.*`)
                    .setImage(returnResponse.results[0].url)
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
        await interaction.editReply({ content: 'The anime API is currently acting up! Try again later.', embeds: [], components: [] });
    }
}