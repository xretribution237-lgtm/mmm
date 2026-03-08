// events/guildMemberAdd.js
// =============================================
// Fires when a new member joins the server.
// Waits 1 second then grants the Unverified role
// to avoid timing issues with Discord's gateway.
// =============================================

const { Events } = require('discord.js');
const { auditLog } = require('../utils/permissions');

module.exports = {
  name: Events.GuildMemberAdd,

  async execute(member, client) {
    // Wait 1 second — prevents race conditions with Discord's member cache
    await new Promise(resolve => setTimeout(resolve, 1000));

    const unverifiedRoleId = process.env.UNVERIFIED_ROLE_ID;

    if (!unverifiedRoleId) {
      console.warn('[AUTOROLE] UNVERIFIED_ROLE_ID not set in environment variables.');
      return;
    }

    try {
      await member.roles.add(unverifiedRoleId);
      console.log(`[AUTOROLE] Granted Unverified role to ${member.user.tag}`);

      await auditLog(client, 'AUTOROLE_GRANTED', 'system', member.user.id, {
        username: member.user.tag,
        role: 'Unverified',
      });
    } catch (err) {
      console.error(`[AUTOROLE] Failed to grant Unverified role to ${member.user.tag}:`, err);
    }
  },
};
