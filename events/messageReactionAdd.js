// events/messageReactionAdd.js
// =============================================
// Handles ✅ reaction in #verify channel.
// Grants Verified role, removes Unverified role,
// and grants 50 emeralds — all atomically.
// =============================================

const { Events } = require('discord.js');
const { playerOps } = require('../database/db');
const { verifiedDM } = require('../utils/embeds');
const { auditLog } = require('../utils/permissions');

const VERIFY_EMOJI  = '✅';
const EMERALD_GRANT = 50;

module.exports = {
  name: Events.MessageReactionAdd,

  async execute(reaction, user, client) {
    // Ignore bot reactions
    if (user.bot) return;

    // Fetch partials if needed
    if (reaction.partial) {
      try { await reaction.fetch(); } catch { return; }
    }
    if (reaction.message.partial) {
      try { await reaction.message.fetch(); } catch { return; }
    }

    // Only process in the verify channel
    const verifyChannelId = process.env.VERIFY_CHANNEL_ID;
    if (!verifyChannelId || reaction.message.channel.id !== verifyChannelId) return;

    // Only process the ✅ emoji
    if (reaction.emoji.name !== VERIFY_EMOJI) return;

    const guild = reaction.message.guild;
    if (!guild) return;

    let member;
    try {
      member = await guild.members.fetch(user.id);
    } catch {
      return;
    }

    const verifiedRoleId   = process.env.VERIFIED_ROLE_ID;
    const unverifiedRoleId = process.env.UNVERIFIED_ROLE_ID;

    if (!verifiedRoleId) {
      console.warn('[VERIFY] VERIFIED_ROLE_ID not set in environment variables.');
      return;
    }

    // Already verified? Skip
    if (member.roles.cache.has(verifiedRoleId)) return;

    try {
      // Grant Verified role
      await member.roles.add(verifiedRoleId);

      // Remove Unverified role if they have it
      if (unverifiedRoleId && member.roles.cache.has(unverifiedRoleId)) {
        await member.roles.remove(unverifiedRoleId);
      }

      // Grant emeralds in DB (atomic transaction)
      const result = playerOps.verifyAndGrant(user.id, user.username, EMERALD_GRANT);

      if (!result.alreadyVerified) {
        // DM the welcome message
        try {
          await user.send({ embeds: [verifiedDM(user.username, EMERALD_GRANT)] });
        } catch {
          // DMs off — role still granted, that's fine
        }

        await auditLog(client, 'USER_VERIFIED', 'system', user.id, {
          username: user.tag,
          emeraldsGranted: EMERALD_GRANT,
          unverifiedRoleRemoved: !!(unverifiedRoleId),
        });

        console.log(`[VERIFY] ✅ ${user.tag} verified. Granted Verified, removed Unverified, +${EMERALD_GRANT} emeralds.`);
      }
    } catch (err) {
      console.error('[VERIFY] Error during verification:', err);
    }
  },
};
