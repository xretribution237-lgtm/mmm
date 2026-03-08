// events/messageReactionAdd.js
// =============================================
// Handles ✅ reaction in #verify channel.
// Grants Verified role, removes Unverified role,
// and grants 50 emeralds atomically.
// =============================================

const { Events } = require('discord.js');
const { playerOps } = require('../database/db');
const { verifiedDM } = require('../utils/embeds');
const { auditLog } = require('../utils/permissions');

const EMERALD_GRANT = 50;

// Discord's ✅ can arrive with or without variation selectors.
// Check multiple forms to be safe.
function isVerifyEmoji(emoji) {
  return (
    emoji.name === '✅' ||
    emoji.name === '\u2705' ||
    emoji.toString().includes('\u2705')
  );
}

module.exports = {
  name: Events.MessageReactionAdd,

  async execute(reaction, user, client) {
    if (user.bot) return;

    // Fetch partials if needed
    if (reaction.partial) {
      try { await reaction.fetch(); }
      catch (err) { console.error('[VERIFY] Failed to fetch reaction partial:', err); return; }
    }
    if (reaction.message.partial) {
      try { await reaction.message.fetch(); }
      catch (err) { console.error('[VERIFY] Failed to fetch message partial:', err); return; }
    }

    // Only process in the verify channel
    const verifyChannelId = process.env.VERIFY_CHANNEL_ID;
    if (!verifyChannelId) {
      console.warn('[VERIFY] VERIFY_CHANNEL_ID not set — skipping.');
      return;
    }
    if (reaction.message.channel.id !== verifyChannelId) return;

    // Log all emojis reacted in verify channel so we can debug
    console.log(`[VERIFY] Emoji received: name="${reaction.emoji.name}" id="${reaction.emoji.id}" toString="${reaction.emoji.toString()}"`);

    if (!isVerifyEmoji(reaction.emoji)) return;

    const guild = reaction.message.guild;
    if (!guild) return;

    let member;
    try {
      member = await guild.members.fetch(user.id);
    } catch (err) {
      console.error('[VERIFY] Could not fetch member:', err);
      return;
    }

    const verifiedRoleId   = process.env.VERIFIED_ROLE_ID;
    const unverifiedRoleId = process.env.UNVERIFIED_ROLE_ID;

    if (!verifiedRoleId) {
      console.warn('[VERIFY] VERIFIED_ROLE_ID not set — cannot grant role.');
      return;
    }

    // Already has Verified role — skip
    if (member.roles.cache.has(verifiedRoleId)) {
      console.log(`[VERIFY] ${user.tag} already verified, skipping.`);
      return;
    }

    try {
      // 1. Grant Verified role
      await member.roles.add(verifiedRoleId);
      console.log(`[VERIFY] Granted Verified role to ${user.tag}`);

      // 2. Remove Unverified role
      if (unverifiedRoleId && member.roles.cache.has(unverifiedRoleId)) {
        await member.roles.remove(unverifiedRoleId);
        console.log(`[VERIFY] Removed Unverified role from ${user.tag}`);
      }

      // 3. Update DB — creates player record, marks verified, grants emeralds
      const result = playerOps.verifyAndGrant(user.id, user.username, EMERALD_GRANT);

      if (result.alreadyVerified) {
        console.log(`[VERIFY] ${user.tag} was already in DB as verified — role granted anyway.`);
        return;
      }

      // 4. DM welcome message
      try {
        await user.send({ embeds: [verifiedDM(user.username, EMERALD_GRANT)] });
      } catch {
        // DMs disabled — fine, role + emeralds still granted
      }

      // 5. Audit
      await auditLog(client, 'USER_VERIFIED', 'system', user.id, {
        username: user.tag,
        emeraldsGranted: EMERALD_GRANT,
      });

      console.log(`[VERIFY] ✅ ${user.tag} fully verified. +${EMERALD_GRANT} emeralds granted.`);

    } catch (err) {
      console.error('[VERIFY] Error during verification:', err);
    }
  },
};
