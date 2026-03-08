// commands/moderation.js
// warn, warnings, clearwarnings, kick, ban, unban, announce
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { warningOps, playerOps } = require('../database/db');
const { requireAdmin, auditLog } = require('../utils/permissions');
const { COLORS, FOOTER, errorEmbed, successEmbed } = require('../utils/embeds');

// ── /warn ──────────────────────────────────────────────────────────────
const warn = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('⚠️ Issue a warning to a player (Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for warning').setRequired(true)),

  async execute(interaction, client) {
    if (!await requireAdmin(interaction)) return;
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    warningOps.add.run({ user_id: target.id, reason, issued_by: interaction.user.id });
    const count = warningOps.countByUser.get(target.id).count;

    await auditLog(client, 'WARNING_ISSUED', interaction.user.id, target.id, { reason, totalWarnings: count });

    await interaction.reply({
      embeds: [
        new EmbedBuilder().setColor(COLORS.orange).setTitle('⚠️ Warning Issued')
          .addFields(
            { name: '👤 User',     value: `<@${target.id}>`, inline: true },
            { name: '📋 Reason',   value: reason,             inline: true },
            { name: '🔢 Total',    value: `${count} warning(s)`, inline: true },
            { name: '🛡️ Issued By', value: `<@${interaction.user.id}>`, inline: true },
          )
          .setFooter(FOOTER).setTimestamp(),
      ],
    });

    // DM the user
    try {
      await target.send({ embeds: [
        new EmbedBuilder().setColor(COLORS.orange).setTitle('⚠️ You received a warning')
          .addFields(
            { name: '📋 Reason', value: reason, inline: false },
            { name: '🔢 Total Warnings', value: `${count}`, inline: true },
          )
          .setDescription('Please review the server rules to avoid further action.')
          .setFooter(FOOTER).setTimestamp(),
      ]});
    } catch (_) {}
  },
};

// ── /warnings ──────────────────────────────────────────────────────────
const warnings = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('📋 View warnings for a user (Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(true)),

  async execute(interaction) {
    if (!await requireAdmin(interaction)) return;
    const target = interaction.options.getUser('user');
    const list   = warningOps.getByUser.all(target.id);

    if (!list.length) {
      return interaction.reply({ embeds: [successEmbed(`<@${target.id}> has no warnings.`)], flags: MessageFlags.Ephemeral });
    }

    const rows = list.map((w, i) =>
      `**${i+1}.** ${w.reason}\n> Issued by <@${w.issued_by}> <t:${Math.floor(new Date(w.created_at).getTime()/1000)}:R>`
    ).join('\n\n');

    await interaction.reply({
      embeds: [
        new EmbedBuilder().setColor(COLORS.orange).setTitle(`⚠️ Warnings for ${target.username}`)
          .setDescription(rows).setFooter({ text: `${list.length} warning(s) • Mod Makers` }).setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

// ── /clearwarnings ─────────────────────────────────────────────────────
const clearwarnings = {
  data: new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription('🧹 Clear all warnings for a user (Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o => o.setName('user').setDescription('User to clear').setRequired(true)),

  async execute(interaction, client) {
    if (!await requireAdmin(interaction)) return;
    const target = interaction.options.getUser('user');
    warningOps.clearByUser.run(target.id);
    await auditLog(client, 'WARNINGS_CLEARED', interaction.user.id, target.id, {});
    await interaction.reply({ embeds: [successEmbed(`All warnings cleared for <@${target.id}>.`)], flags: MessageFlags.Ephemeral });
  },
};

// ── /kick ──────────────────────────────────────────────────────────────
const kick = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('👢 Kick a member from the server (Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

  async execute(interaction, client) {
    if (!await requireAdmin(interaction)) return;
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    let member;
    try { member = await interaction.guild.members.fetch(target.id); } catch {
      return interaction.reply({ embeds: [errorEmbed('User not found in this server.')], flags: MessageFlags.Ephemeral });
    }

    try {
      await member.kick(reason);
    } catch (err) {
      return interaction.reply({ embeds: [errorEmbed(`Failed to kick: ${err.message}`)], flags: MessageFlags.Ephemeral });
    }

    await auditLog(client, 'MEMBER_KICKED', interaction.user.id, target.id, { reason });
    await interaction.reply({
      embeds: [
        new EmbedBuilder().setColor(COLORS.red).setTitle('👢 Member Kicked')
          .addFields(
            { name: '👤 User',   value: `${target.tag}`, inline: true },
            { name: '📋 Reason', value: reason,           inline: true },
            { name: '🛡️ By',    value: `<@${interaction.user.id}>`, inline: true },
          )
          .setFooter(FOOTER).setTimestamp(),
      ],
    });
  },
};

// ── /ban ───────────────────────────────────────────────────────────────
const ban = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('🔨 Ban a member from the server (Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

  async execute(interaction, client) {
    if (!await requireAdmin(interaction)) return;
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    try {
      await interaction.guild.members.ban(target.id, { reason });
    } catch (err) {
      return interaction.reply({ embeds: [errorEmbed(`Failed to ban: ${err.message}`)], flags: MessageFlags.Ephemeral });
    }

    await auditLog(client, 'MEMBER_BANNED', interaction.user.id, target.id, { reason });
    await interaction.reply({
      embeds: [
        new EmbedBuilder().setColor(COLORS.red).setTitle('🔨 Member Banned')
          .addFields(
            { name: '👤 User',   value: `${target.tag}`, inline: true },
            { name: '📋 Reason', value: reason,           inline: true },
            { name: '🛡️ By',    value: `<@${interaction.user.id}>`, inline: true },
          )
          .setFooter(FOOTER).setTimestamp(),
      ],
    });
  },
};

// ── /unban ─────────────────────────────────────────────────────────────
const unban = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('✅ Unban a user (Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(o => o.setName('userid').setDescription('User ID to unban').setRequired(true)),

  async execute(interaction, client) {
    if (!await requireAdmin(interaction)) return;
    const userId = interaction.options.getString('userid').trim();

    try {
      await interaction.guild.members.unban(userId);
    } catch (err) {
      return interaction.reply({ embeds: [errorEmbed(`Failed to unban: ${err.message}`)], flags: MessageFlags.Ephemeral });
    }

    await auditLog(client, 'MEMBER_UNBANNED', interaction.user.id, userId, {});
    await interaction.reply({ embeds: [successEmbed(`User \`${userId}\` has been unbanned.`)] });
  },
};

// ── /announce ──────────────────────────────────────────────────────────
const announce = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('📢 Send an announcement to #announcements (Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('message').setDescription('Announcement content').setRequired(true).setMaxLength(2000))
    .addStringOption(o => o.setName('title').setDescription('Announcement title').setRequired(false).setMaxLength(100)),

  async execute(interaction, client) {
    if (!await requireAdmin(interaction)) return;
    const message = interaction.options.getString('message');
    const title   = interaction.options.getString('title') || '📢 Announcement';
    const channelId = process.env.ANNOUNCEMENTS_CHANNEL_ID;

    if (!channelId) return interaction.reply({ embeds: [errorEmbed('ANNOUNCEMENTS_CHANNEL_ID not set.')], flags: MessageFlags.Ephemeral });

    try {
      const ch = await client.channels.fetch(channelId);
      await ch.send({
        embeds: [
          new EmbedBuilder().setColor(COLORS.blue).setTitle(title).setDescription(message)
            .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
            .setFooter(FOOTER).setTimestamp(),
        ],
      });
      await auditLog(client, 'ANNOUNCEMENT_SENT', interaction.user.id, null, { title, message });
      await interaction.reply({ embeds: [successEmbed('Announcement posted!')], flags: MessageFlags.Ephemeral });
    } catch (err) {
      await interaction.reply({ embeds: [errorEmbed(`Failed: ${err.message}`)], flags: MessageFlags.Ephemeral });
    }
  },
};

module.exports = { warn, warnings, clearwarnings, kick, ban, unban, announce };
