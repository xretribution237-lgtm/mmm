// commands/modprice.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { MOD_TYPES } = require('../utils/modPricing');
const { COLORS, FOOTER } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('modprice')
    .setDescription('💰 View the full price list for all mod types'),

  async execute(interaction) {
    const rows = Object.entries(MOD_TYPES).map(([, info]) =>
      `${info.emoji} **${info.label}** — **${info.cost} ❇️**\n> ${info.description}`
    ).join('\n\n');

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.gold)
          .setTitle('💰 Mod Price List')
          .setDescription(rows)
          .addFields({ name: '🆓 Free Mod', value: 'Every new member gets **1 free mod request** after verifying!', inline: false })
          .setFooter(FOOTER)
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
