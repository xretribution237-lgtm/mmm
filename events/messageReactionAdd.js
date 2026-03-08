// events/messageReactionAdd.js

const { Events } = require('discord.js');
const { playerOps } = require('../database/db');
const { verifiedDM } = require('../utils/embeds');
const { auditLog } = require('../utils/permissions');

const EMERALD_GRANT = 50;

module.exports = {
  name: Events.MessageReactionAdd,

  async execute(reaction, user, client) {
    // ── DIAGNOSTIC: log every single reaction the bot sees ──────────
    console.log(`[REACTION] user=${user.tag} bot=${user.bot} emoji="${reaction.emoji.name}" channel=${reaction.message.channelId} partial=${reaction.partial}`);

    if (user.bot) return;

    // Fetch partials
    if (reaction.partial) {
      try { await reaction.fetch(); }
      catch (err) { console.error('[VERIFY] fetch reaction partial failed:', err); return; }
    }
    if (reaction.message.partial) {
      try { await reaction.message.fetch(); }
      catch (err) { console.error('[VERIFY] fetch message partial failed:', err); return; }
    }

    const verifyChannelId = process.env.VERIFY_CHANNEL_ID;
    console.log(`[VERIFY] VERIFY_CHANNEL_ID="${verifyChannelId}" reaction.message.channelId="${reaction.message.channelId}"`);

    if (!verifyChannelId) {
      console.warn('[VERIFY] VERIFY_CHANNEL_ID is not set — skipping all reactions.');
      return;
    }

    if (reaction.message.channel.id !== verifyChannelId) {
      console.log(`[VERIFY] Wrong channel, ignoring.`);
      return;
    }

    // Log the exact emoji data so we can see what Discord is sending
    console.log(`[VERIFY] Emoji in verify channel — name="${reaction.emoji.name}" id="${reaction.emoji.id}" toString="${reaction.emoji.toString()}"`);

    // Match ✅ in all its forms
    const emojiName = reaction.emoji.name || '';
    const isCheckmark = emojiName.includes('\u2705') || emojiName === '✅';

    if (!isCheckmark) {
      console.log(`[VERIFY] Emoji did not match checkmark, ignoring.`);
      return;
    }

    const guild = reaction.message.guild;
    if (!guild) { console.error('[VERIFY] No guild on message'); return; }

    let member;
    try {
      member = await guild.members.fetch(user.id);
    } catch (err) {
      console.error('[VERIFY] Could not fetch member:', err);
      return;
    }

    const verifiedRoleId   = process.env.VERIFIED_ROLE_ID;
    const unverifiedRoleId = process.env.UNVERIFIED_ROLE_ID;

    console.log(`[VERIFY] VERIFIED_ROLE_ID="${verifiedRoleId}" UNVERIFIED_ROLE_ID="${unverifiedRoleId}"`);

    if (!verifiedRoleId) {
      console.warn('[VERIFY] VERIFIED_ROLE_ID not set — cannot grant role.');
      return;
    }

    if (member.roles.cache.has(verifiedRoleId)) {
      console.log(`[VERIFY] ${user.tag} already has Verified role, skipping.`);
      return;
    }

    try {
      await member.roles.add(verifiedRoleId);
      console.log(`[VERIFY] ✅ Granted Verified role to ${user.tag}`);

      if (unverifiedRoleId && member.roles.cache.has(unverifiedRoleId)) {
        await member.roles.remove(unverifiedRoleId);
        console.log(`[VERIFY] Removed Unverified role from ${user.tag}`);
      }

      const result = playerOps.verifyAndGrant(user.id, user.username, EMERALD_GRANT);
      console.log(`[VERIFY] DB result: alreadyVerified=${result.alreadyVerified}`);

      if (!result.alreadyVerified) {
        try { await user.send({ embeds: [verifiedDM(user.username, EMERALD_GRANT)] }); }
        catch { console.log(`[VERIFY] Could not DM ${user.tag} (DMs off)`); }

        await auditLog(client, 'USER_VERIFIED', 'system', user.id, {
          username: user.tag,
          emeraldsGranted: EMERALD_GRANT,
        });
      }

      console.log(`[VERIFY] Done — ${user.tag} fully verified.`);

    } catch (err) {
      console.error('[VERIFY] Error during verification:', err);
    }
  },
};
