// src/commands/leaderboard.js
const { SlashCommandBuilder } = require('discord.js');
const { playerOps } = require('../database/db');
const { leaderboardEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('👑 View the top Emerald holders'),

  async execute(interaction) {
    const players = playerOps.getLeaderboard.all();
    await interaction.reply({ embeds: [leaderboardEmbed(players)] });
  },
};
