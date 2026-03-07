// src/utils/permissions.js
// =============================================
// Permission helpers — all admin checks go
// through here so nothing is duplicated
// =============================================

const { auditOps } = require('../database/db');

/**
 * Returns true if the member has the Admin or Mod role
 */
function isAdmin(member) {
  const adminRoleId = process.env.ADMIN_ROLE_ID;
  const modRoleId   = process.env.MOD_ROLE_ID;
  return (
    member.permissions.has('Administrator') ||
    (adminRoleId && member.roles.cache.has(adminRoleId)) ||
    (modRoleId   && member.roles.cache.has(modRoleId))
  );
}

/**
 * Asserts the interaction user is an admin.
 * Replies with an ephemeral error and returns false if not.
 */
async function requireAdmin(interaction) {
  if (isAdmin(interaction.member)) return true;
  await interaction.reply({
    content: '🔒 This command is restricted to admins only.',
    ephemeral: true,
  });
  // Log the unauthorized attempt
  auditOps.log.run({
    action: 'UNAUTHORIZED_ADMIN_COMMAND',
    performed_by: interaction.user.id,
    target_user: null,
    details: JSON.stringify({ command: interaction.commandName }),
  });
  return false;
}

/**
 * Log an admin action to the audit trail and to #admin-log if configured
 */
async function auditLog(client, action, performedBy, targetUser, details) {
  // DB audit
  auditOps.log.run({
    action,
    performed_by: performedBy,
    target_user: targetUser || null,
    details: typeof details === 'object' ? JSON.stringify(details) : details,
  });

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
        { name: 'Details', value: typeof details === 'object' ? `\`\`\`json\n${JSON.stringify(details, null, 2)}\n\`\`\`` : String(details) },
      )
      .setTimestamp();
    await ch.send({ embeds: [embed] });
  } catch (_) {}
}

module.exports = { isAdmin, requireAdmin, auditLog };
