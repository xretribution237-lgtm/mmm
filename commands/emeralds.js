// commands/emeralds.js
// /giveemerald and /takeemerald — admin tools
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { playerOps, transactionOps } = require('../database/db');
const { adminEmeraldEmbed, errorEmbed, COLORS, FOOTER } = require('../utils/embeds');
const { requireAdmin, auditLog } = require('../utils/permissions');

const give = {
  data: new SlashCommandBuilder()
    .setName('giveemerald')
    .setDescription('🛡️ Give Emeralds to a player (Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o => o.setName('user').setDescription('Target player').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount of Emeralds').setRequired(true).setMinValue(1).setMaxValue(100000))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the grant').setRequired(false))
    .addBooleanOption(o => o.setName('verify').setDescription('Also mark this player as verified in the DB?').setRequired(false)),

  async execute(interaction, client) {
    if (!await requireAdmin(interaction)) return;
    const target     = interaction.options.getUser('user');
    const amount     = interaction.options.getInteger('amount');
    const reason     = interaction.options.getString('reason') || 'admin_grant';
    const markVerify = interaction.options.getBoolean('verify') ?? false;

    // Create player record if it doesn't exist yet
    let player = playerOps.get.get(target.id);
    if (!player) {
      playerOps.create.run({ user_id: target.id, username: target.username, emeralds: 0, verified: 0 });
      player = playerOps.get.get(target.id);
    }

    // Optionally mark as verified
    if (markVerify && !player.verified) {
      playerOps.setVerified.run(target.id);
    }

    playerOps.updateEmeralds.run({ user_id: target.id, amount });
    transactionOps.log.run({ user_id: target.id, amount, type: 'grant', reason, ref_id: null, performed_by: interaction.user.id });

    const updated = playerOps.get.get(target.id);
    await auditLog(client, 'ADMIN_GIVE_EMERALDS', interaction.user.id, target.id, { amount, reason, markedVerified: markVerify });

    await interaction.reply({ embeds: [adminEmeraldEmbed('give', target, amount, updated.emeralds, interaction.user)] });

    // Notify target
    try {
      await target.send({ embeds: [
        new EmbedBuilder().setColor(COLORS.green)
          .setTitle('❇️ Emeralds Received!')
          .setDescription(`An admin has granted you **+${amount} ❇️ Emeralds**!\n**New balance:** ${updated.emeralds} ❇️\n**Reason:** ${reason}`)
          .setFooter(FOOTER).setTimestamp(),
      ]});
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
    if (!player) return interaction.reply({ embeds: [errorEmbed('Player not found. They have not verified yet.')], flags: MessageFlags.Ephemeral });
    if (player.emeralds < amount) return interaction.reply({ embeds: [errorEmbed(`Player only has **${player.emeralds} ❇️** — cannot deduct **${amount} ❇️**.`)], flags: MessageFlags.Ephemeral });

    playerOps.updateEmeralds.run({ user_id: target.id, amount: -amount });
    transactionOps.log.run({ user_id: target.id, amount: -amount, type: 'deduct', reason, ref_id: null, performed_by: interaction.user.id });

    const updated = playerOps.get.get(target.id);
    await auditLog(client, 'ADMIN_TAKE_EMERALDS', interaction.user.id, target.id, { amount, reason });
    await interaction.reply({ embeds: [adminEmeraldEmbed('take', target, amount, updated.emeralds, interaction.user)] });
  },
};

// /forceverify — manually verify a player in the DB without them needing to react
const forceverify = {
  data: new SlashCommandBuilder()
    .setName('forceverify')
    .setDescription('🛡️ Manually verify a player in the database (Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o => o.setName('user').setDescription('Player to verify').setRequired(true)),

  async execute(interaction, client) {
    if (!await requireAdmin(interaction)) return;
    const target = interaction.options.getUser('user');

    let player = playerOps.get.get(target.id);
    if (!player) {
      playerOps.create.run({ user_id: target.id, username: target.username, emeralds: 0, verified: 0 });
    }

    const result = playerOps.verifyAndGrant(target.id, target.username, 50);

    // Also grant the Discord role if possible
    try {
      const verifiedRoleId   = process.env.VERIFIED_ROLE_ID;
      const unverifiedRoleId = process.env.UNVERIFIED_ROLE_ID;
      const member = await interaction.guild.members.fetch(target.id);
      if (verifiedRoleId && !member.roles.cache.has(verifiedRoleId)) {
        await member.roles.add(verifiedRoleId);
      }
      if (unverifiedRoleId && member.roles.cache.has(unverifiedRoleId)) {
        await member.roles.remove(unverifiedRoleId);
      }
    } catch (err) {
      console.error('[FORCEVERIFY] Could not assign role:', err);
    }

    await auditLog(client, 'FORCE_VERIFIED', interaction.user.id, target.id, { alreadyVerified: result.alreadyVerified });

    const updated = playerOps.get.get(target.id);
    await interaction.reply({
      embeds: [
        new EmbedBuilder().setColor(COLORS.green)
          .setTitle('✅ Player Force-Verified')
          .addFields(
            { name: '👤 Player',     value: `<@${target.id}>`,       inline: true },
            { name: '❇️ Emeralds',   value: `${updated.emeralds}`,   inline: true },
            { name: '📊 Status',     value: result.alreadyVerified ? 'Was already verified' : 'Newly verified + 50 ❇️ granted', inline: false },
          )
          .setFooter(FOOTER).setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

module.exports = { give, take, forceverify };
