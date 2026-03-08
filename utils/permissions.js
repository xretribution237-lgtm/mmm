// utils/permissions.js
// =============================================
// Permission helpers — all admin checks go
// through here so nothing is duplicated.
//
// STRICT MODE: A user MUST have the Admin or
// Moderator role assigned in the server.
// Having Discord's "Administrator" permission
// alone is NOT enough — role must be present.
// =============================================

const { auditOps } = require('../database/db');

/**
 * Returns true ONLY if the member has the
 * 👑 Admin role or 🛡️ Moderator role.
 * Discord's built-in Administrator permission
 * does NOT bypass this — role must be assigned.
 */
function isAdmin(member) {
  const adminRoleId = process.env.ADMIN_ROLE_ID;
  const modRoleId   = process.env.MOD_ROLE_ID;

  if (!adminRoleId && !modRoleId) {
    // Roles not configured yet (pre-setup) — fall back to Discord Administrator
    // so /setup itself can still run
    return member.permissions.has('Administrator');
  }

  return (
    (adminRoleId && member.roles.cache.has(adminRoleId)) ||
    (modRoleId   && member.roles.cache.has(modRoleId))
  );
}

/**
 * Asserts the interaction user is an admin.
 * Replies with an ephemeral error and returns false if not.
 * Logs every failed attempt to the audit trail.
 */
async function requireAdmin(interaction) {
  if (isAdmin(interaction.member)) return true;

  await interaction.reply({
    embeds: [{
      color: 0xD32F2F,
      title: '🔒 Access Denied',
      description:
        `You don't have permission to use this command.\n\n` +
        `This command requires the **👑 Admin** or **🛡️ Moderator** role.\n` +
        `Contact a server admin if you believe this is a mistake.`,
      footer: { text: 'CreativeMode.net' },
      timestamp: new Date().toISOString(),
    }],
    ephemeral: true,
  });

  // Log the unauthorized attempt
  try {
    auditOps.log.run({
      action: 'UNAUTHORIZED_ADMIN_COMMAND',
      performed_by: interaction.user.id,
      target_user: null,
      details: JSON.stringify({
        command: interaction.commandName,
        username: interaction.user.tag,
        guild: interaction.guild?.name,
      }),
    });
  } catch (_) {}

  return false;
}

/**
 * Log an admin action to the audit trail and to #admin-log channel
 */
async function auditLog(client, action, performedBy, targetUser, details) {
  // DB audit
  try {
    auditOps.log.run({
      action,
      performed_by: performedBy,
      target_user: targetUser || null,
      details: typeof details === 'object' ? JSON.stringify(details) : details,
    });
  } catch (_) {}

  // Discord channel log
  const logChannelId = process.env.ADMIN_LOG_CHANNEL_ID;
  if (!logChannelId) return;

  try {
    const ch = await client.channels.fetch(logChannelId);
    if (!ch) return;

    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
      .setColor(0x7B1FA2)
      .setTitle(`🛡️ Audit: ${action}`)
      .addFields(
        { name: 'Performed By', value: `<@${performedBy}>`, inline: true },
        ...(targetUser ? [{ name: 'Target', value: `<@${targetUser}>`, inline: true }] : []),
        {
          name: 'Details',
          value: typeof details === 'object'
            ? `\`\`\`json\n${JSON.stringify(details, null, 2)}\n\`\`\``
            : String(details),
        },
      )
      .setTimestamp();

    await ch.send({ embeds: [embed] });
  } catch (_) {}
}

module.exports = { isAdmin, requireAdmin, auditLog };
