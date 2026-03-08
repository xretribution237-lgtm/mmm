// commands/shop.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { COLORS, FOOTER, errorEmbed } = require('../utils/embeds');
const { MOD_TYPES } = require('../utils/modPricing');
const { playerOps } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('🛍️ View everything you can spend Emeralds on'),

  async execute(interaction) {
    const player = playerOps.get.get(interaction.user.id);
    const balance = player?.emeralds ?? 0;

    const modRows = Object.entries(MOD_TYPES).map(([, info]) => {
      const canAfford = balance >= info.cost ? '✅' : '❌';
      return `${canAfford} ${info.emoji} **${info.label}** — ${info.cost} ❇️\n> ${info.description}`;
    }).join('\n\n');

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.gold)
          .setTitle('🛍️ Mod Makers Shop')
          .setDescription(`Your balance: **${balance} ❇️**\n\n${modRows}`)
          .addFields({
            name: '💡 How to spend',
            value: 'Use `/requestmod` to submit a mod request.\nUse `/ticket` to purchase more Emeralds.',
          })
          .setFooter(FOOTER)
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
