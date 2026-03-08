// commands/mystatus.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { modOps, playerOps } = require('../database/db');
const { COLORS, FOOTER, errorEmbed } = require('../utils/embeds');

const STATUS_EMOJI = { pending: '🟡', 'in-progress': '🔵', completed: '🟢', rejected: '🔴' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mystatus')
    .setDescription('🧩 View all your mod requests and their status'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const player = playerOps.get.get(userId);

    if (!player || !player.verified) {
      return interaction.reply({ embeds: [errorEmbed('You must verify first.')], flags: MessageFlags.Ephemeral });
    }

    const requests = modOps.getByUser.all(userId);

    if (!requests.length) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder().setColor(COLORS.blue)
            .setTitle('🧩 Your Mod Requests')
            .setDescription("You haven't submitted any mod requests yet.\nUse `/requestmod` to get started!")
            .setFooter(FOOTER),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const rows = requests.map(r => {
      const emoji = STATUS_EMOJI[r.status] || '⚪';
      const cost  = r.is_free ? '`FREE`' : `${r.emerald_cost} ❇️`;
      const time  = `<t:${Math.floor(new Date(r.created_at).getTime() / 1000)}:R>`;
      return `${emoji} **${r.title}** (${r.mod_type})\n> Cost: ${cost} | Status: \`${r.status.toUpperCase()}\` | ID: \`${r.id.slice(0,8).toUpperCase()}\` | ${time}`;
    }).join('\n\n');

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.blue)
          .setTitle('🧩 Your Mod Requests')
          .setDescription(rows.length > 4000 ? rows.slice(0, 3997) + '...' : rows)
          .setFooter({ text: `${requests.length} total request(s) • Mod Makers` })
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
