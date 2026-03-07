// src/commands/balance.js
const { SlashCommandBuilder } = require('discord.js');
const { playerOps } = require('../database/db');
const { balanceEmbed, errorEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('❇️ Check your Emerald balance')
    .addUserOption(o => o
      .setName('user')
      .setDescription('[Admin] Check another user\'s balance')
    ),

  async execute(interaction, client) {
    const { isAdmin } = require('../utils/permissions');
    const targetUser  = interaction.options.getUser('user');

    // Non-admins can only check their own balance
    if (targetUser && targetUser.id !== interaction.user.id && !isAdmin(interaction.member)) {
      return interaction.reply({ content: '🔒 You can only check your own balance.', ephemeral: true });
    }

    const user   = targetUser || interaction.user;
    const player = playerOps.get.get(user.id);

    if (!player || !player.verified) {
      return interaction.reply({
        embeds: [errorEmbed(`${user.id === interaction.user.id ? 'You haven\'t' : 'This user hasn\'t'} verified yet.`)],
        ephemeral: true,
      });
    }

    await interaction.reply({ embeds: [balanceEmbed(user, player)], ephemeral: true });
  },
};
