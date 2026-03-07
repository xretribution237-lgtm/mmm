// src/commands/emeralds.js
// /giveemerald and /takeemerald — admin tools
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { playerOps, transactionOps } = require('../database/db');
const { adminEmeraldEmbed, errorEmbed } = require('../utils/embeds');
const { requireAdmin, auditLog } = require('../utils/permissions');

const give = {
  data: new SlashCommandBuilder()
    .setName('giveemerald')
    .setDescription('🛡️ Give Emeralds to a player (Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o => o.setName('user').setDescription('Target player').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount of Emeralds').setRequired(true).setMinValue(1).setMaxValue(100000))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the grant').setRequired(false)),

  async execute(interaction, client) {
    if (!await requireAdmin(interaction)) return;
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const reason = interaction.options.getString('reason') || 'admin_grant';

    const player = playerOps.get.get(target.id);
    if (!player) return interaction.reply({ embeds: [errorEmbed('Player not found or not verified.')], ephemeral: true });

    playerOps.updateEmeralds.run({ user_id: target.id, amount });
    transactionOps.log.run({ user_id: target.id, amount, type: 'grant', reason, ref_id: null, performed_by: interaction.user.id });

    const updated = playerOps.get.get(target.id);
    await auditLog(client, 'ADMIN_GIVE_EMERALDS', interaction.user.id, target.id, { amount, reason });

    await interaction.reply({ embeds: [adminEmeraldEmbed('give', target, amount, updated.emeralds, interaction.user)] });

    // Notify target
    try {
      await target.send({ embeds: [{
        color: 0x00C853,
        title: '❇️ Emeralds Received!',
        description: `An admin has granted you **+${amount} ❇️ Emeralds**!\n**New balance:** ${updated.emeralds} ❇️\n**Reason:** ${reason}`,
        footer: { text: 'CreativeMode.net' },
        timestamp: new Date().toISOString(),
      }]});
    } catch (_) {}
  },
};

const take = {
  data: new SlashCommandBuilder()
    .setName('takeemerald')
    .setDescription('🛡️ Remove Emeralds from a player (Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o => o.setName('user').setDescription('Target player').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount to remove').setRequired(true).setMinValue(1).setMaxValue(100000))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

  async execute(interaction, client) {
    if (!await requireAdmin(interaction)) return;
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const reason = interaction.options.getString('reason');

    const player = playerOps.get.get(target.id);
    if (!player) return interaction.reply({ embeds: [errorEmbed('Player not found.')], ephemeral: true });

    if (player.emeralds < amount) {
      return interaction.reply({ embeds: [errorEmbed(`Player only has **${player.emeralds} ❇️** — cannot deduct **${amount} ❇️**.`)], ephemeral: true });
    }

    playerOps.updateEmeralds.run({ user_id: target.id, amount: -amount });
    transactionOps.log.run({ user_id: target.id, amount: -amount, type: 'deduct', reason, ref_id: null, performed_by: interaction.user.id });

    const updated = playerOps.get.get(target.id);
    await auditLog(client, 'ADMIN_TAKE_EMERALDS', interaction.user.id, target.id, { amount, reason });

    await interaction.reply({ embeds: [adminEmeraldEmbed('take', target, amount, updated.emeralds, interaction.user)] });
  },
};

module.exports = { give, take };
