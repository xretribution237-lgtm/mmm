// commands/transactions.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { transactionOps, playerOps } = require('../database/db');
const { COLORS, FOOTER, errorEmbed } = require('../utils/embeds');

const TYPE_EMOJI = {
  grant: '🎁', spend: '💸', refund: '🔄', transfer_in: '📥',
  transfer_out: '📤', deduct: '🔻', daily_reward: '📅',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transactions')
    .setDescription('📜 View your last 20 Emerald transactions'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const player = playerOps.get.get(userId);

    if (!player || !player.verified) {
      return interaction.reply({ embeds: [errorEmbed('You must verify first.')], flags: MessageFlags.Ephemeral });
    }

    const history = transactionOps.getHistory.all(userId);

    if (!history.length) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLORS.blue).setTitle('📜 Transaction History').setDescription('No transactions yet.').setFooter(FOOTER)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const rows = history.map(t => {
      const emoji  = TYPE_EMOJI[t.type] || '💰';
      const sign   = t.amount > 0 ? '+' : '';
      const time   = `<t:${Math.floor(new Date(t.created_at).getTime() / 1000)}:R>`;
      return `${emoji} **${sign}${t.amount} ❇️** — \`${t.reason}\` ${time}`;
    }).join('\n');

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.blue)
          .setTitle('📜 Transaction History')
          .setDescription(rows)
          .addFields({ name: '💰 Current Balance', value: `${player.emeralds} ❇️`, inline: true })
          .setFooter(FOOTER)
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
