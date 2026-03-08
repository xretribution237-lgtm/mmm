// commands/daily.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { playerOps, transactionOps } = require('../database/db');
const { COLORS, FOOTER, errorEmbed } = require('../utils/embeds');

const DAILY_AMOUNT = 10;
const COOLDOWN_HOURS = 24;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('❇️ Claim your daily Emerald reward'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const player = playerOps.get.get(userId);

    if (!player || !player.verified) {
      return interaction.reply({ embeds: [errorEmbed('You must verify first!')], flags: MessageFlags.Ephemeral });
    }

    // Check cooldown
    if (player.daily_claimed) {
      const last    = new Date(player.daily_claimed);
      const now     = new Date();
      const diffMs  = now - last;
      const diffHrs = diffMs / (1000 * 60 * 60);

      if (diffHrs < COOLDOWN_HOURS) {
        const nextClaim = new Date(last.getTime() + COOLDOWN_HOURS * 60 * 60 * 1000);
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.orange)
              .setTitle('⏱️ Already Claimed')
              .setDescription(`You already claimed your daily reward!\n\nNext claim: <t:${Math.floor(nextClaim.getTime() / 1000)}:R>`)
              .setFooter(FOOTER),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    // Grant reward
    playerOps.updateEmeralds.run({ user_id: userId, amount: DAILY_AMOUNT });
    playerOps.setDailyClaimed.run(userId);
    transactionOps.log.run({
      user_id: userId, amount: DAILY_AMOUNT, type: 'grant',
      reason: 'daily_reward', ref_id: null, performed_by: 'system',
    });

    const updated = playerOps.get.get(userId);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.green)
          .setTitle('🎁 Daily Reward Claimed!')
          .setDescription(`You received **+${DAILY_AMOUNT} ❇️ Emeralds**!`)
          .addFields(
            { name: '💰 New Balance', value: `${updated.emeralds} ❇️`, inline: true },
            { name: '⏭️ Next Claim',  value: `<t:${Math.floor((Date.now() + COOLDOWN_HOURS * 3600000) / 1000)}:R>`, inline: true },
          )
          .setFooter(FOOTER)
          .setTimestamp(),
      ],
    });
  },
};
