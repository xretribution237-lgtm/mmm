// src/utils/embeds.js
// =============================================
// CreativeMode Bot - Embed Builder
// Centralized, beautiful embed templates with
// consistent branding across all bot messages
// =============================================

const { EmbedBuilder } = require('discord.js');

// Brand colors
const COLORS = {
  green:   0x00C853,  // Emerald green - primary brand
  gold:    0xFFD700,  // Premium / rewards
  blue:    0x0288D1,  // Info / neutral
  red:     0xD32F2F,  // Error / danger
  orange:  0xF57C00,  // Warning
  purple:  0x7B1FA2,  // Admin actions
  dark:    0x1A1A2E,  // Dark background feel
  white:   0xF5F5F5,  // Clean / success
};

const EMOJI = {
  emerald: '❇️',
  verified: '✅',
  mod: '🧩',
  ticket: '🎫',
  admin: '🛡️',
  warning: '⚠️',
  error: '❌',
  success: '✅',
  lock: '🔒',
  backup: '💾',
  crown: '👑',
  info: 'ℹ️',
};

const FOOTER = { text: 'CreativeMode.net • Mod Platform', iconURL: null };

module.exports = {
  COLORS,
  EMOJI,

  // ── Verification embed (sent in #verify) ──────────────────────────
  verifyEmbed() {
    return new EmbedBuilder()
      .setColor(COLORS.green)
      .setTitle(`${EMOJI.verified} Welcome to CreativeMode.net`)
      .setDescription(
        `> **You're one reaction away from the community.**\n\n` +
        `React with ✅ below to verify yourself and gain access to the server.\n\n` +
        `**Upon verifying you'll receive:**\n` +
        `${EMOJI.emerald} **50 Emeralds** — our server currency\n` +
        `🧩 **1 Free Mod Request** — no cost, on us\n` +
        `💬 **Full server access** — chat, tickets, leaderboard\n\n` +
        `*Emeralds are used to request custom mods from our admin team.*`
      )
      .setImage('https://i.imgur.com/placeholder-banner.png') // Replace with your banner
      .setFooter(FOOTER)
      .setTimestamp();
  },

  // ── Verification success DM ────────────────────────────────────────
  verifiedDM(username, emeralds) {
    return new EmbedBuilder()
      .setColor(COLORS.green)
      .setTitle(`${EMOJI.success} You're verified, ${username}!`)
      .setDescription(
        `Welcome to **CreativeMode.net**! Here's what you've received:\n\n` +
        `${EMOJI.emerald} **${emeralds} Emeralds** added to your balance\n` +
        `🧩 **1 Free Mod Request** ready to use\n\n` +
        `Use \`/balance\` to check your emeralds.\n` +
        `Use \`/requestmod\` to submit your first mod request.\n` +
        `Use \`/ticket\` to open a support ticket.`
      )
      .setFooter(FOOTER)
      .setTimestamp();
  },

  // ── Balance embed ──────────────────────────────────────────────────
  balanceEmbed(user, player) {
    return new EmbedBuilder()
      .setColor(COLORS.green)
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
      .setTitle(`${EMOJI.emerald} Emerald Balance`)
      .addFields(
        { name: `${EMOJI.emerald} Emeralds`, value: `**${player.emeralds.toLocaleString()}**`, inline: true },
        { name: '🧩 Free Mod', value: player.free_mod_used ? '`Used`' : '`Available`', inline: true },
        { name: '📅 Member Since', value: `<t:${Math.floor(new Date(player.joined_at).getTime() / 1000)}:R>`, inline: true }
      )
      .setFooter(FOOTER)
      .setTimestamp();
  },

  // ── Mod request embed (posted in #mod-requests by admin) ───────────
  modRequestEmbed(request, requester) {
    const statusColors = {
      pending:     COLORS.orange,
      'in-progress': COLORS.blue,
      completed:   COLORS.green,
      rejected:    COLORS.red,
    };

    const statusEmoji = {
      pending:     '🟡',
      'in-progress': '🔵',
      completed:   '🟢',
      rejected:    '🔴',
    };

    return new EmbedBuilder()
      .setColor(statusColors[request.status] || COLORS.blue)
      .setTitle(`${EMOJI.mod} Mod Request #${request.id.slice(0, 8).toUpperCase()}`)
      .setDescription(`> ${request.description}`)
      .addFields(
        { name: '📋 Title', value: request.title, inline: true },
        { name: '🔧 Type', value: request.mod_type, inline: true },
        { name: `${EMOJI.emerald} Cost`, value: request.is_free ? '`FREE`' : `**${request.emerald_cost}** Emeralds`, inline: true },
        { name: '👤 Requested By', value: `<@${request.user_id}>`, inline: true },
        { name: '📊 Status', value: `${statusEmoji[request.status]} \`${request.status.toUpperCase()}\``, inline: true },
        { name: '🛠️ Assigned To', value: request.assigned_to ? `<@${request.assigned_to}>` : '`Unassigned`', inline: true },
        { name: '🕐 Submitted', value: `<t:${Math.floor(new Date(request.created_at).getTime() / 1000)}:R>`, inline: true },
      )
      .setFooter({ text: `ID: ${request.id} • CreativeMode.net` })
      .setTimestamp();
  },

  // ── Ticket opened embed (sent in new ticket channel) ───────────────
  ticketOpenEmbed(user, subject, ticketId) {
    return new EmbedBuilder()
      .setColor(COLORS.blue)
      .setTitle(`${EMOJI.ticket} Ticket Opened`)
      .setDescription(
        `Hello <@${user.id}>, your ticket has been created.\n\n` +
        `**Subject:** ${subject}\n\n` +
        `An admin will be with you shortly. Please describe your issue in as much detail as possible.\n\n` +
        `> Use the button below to close this ticket when resolved.`
      )
      .addFields(
        { name: '🎫 Ticket ID', value: `\`${ticketId.slice(0, 8).toUpperCase()}\``, inline: true },
        { name: '👤 Opened By', value: `<@${user.id}>`, inline: true },
        { name: '📅 Opened', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      )
      .setFooter(FOOTER)
      .setTimestamp();
  },

  // ── Ticket panel embed (in #tickets channel) ───────────────────────
  ticketPanelEmbed() {
    return new EmbedBuilder()
      .setColor(COLORS.blue)
      .setTitle(`${EMOJI.ticket} Support & Requests`)
      .setDescription(
        `Need help? Have a question about your mod request? Want to purchase more ${EMOJI.emerald} Emeralds?\n\n` +
        `**Click the button below** to open a private ticket with our team.\n\n` +
        `**What tickets are used for:**\n` +
        `• General support questions\n` +
        `• Mod request follow-ups\n` +
        `• Emerald purchases\n` +
        `• Billing or account issues\n` +
        `• Appeals or reports\n\n` +
        `*Tickets are private — only you and admins can see them.*`
      )
      .setFooter(FOOTER)
      .setTimestamp();
  },

  // ── Leaderboard embed ──────────────────────────────────────────────
  leaderboardEmbed(players) {
    const medals = ['🥇', '🥈', '🥉'];
    const rows = players.map((p, i) => {
      const rank = medals[i] || `\`#${i + 1}\``;
      return `${rank} <@${p.user_id}> — **${p.emeralds.toLocaleString()}** ${EMOJI.emerald}`;
    });

    return new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle(`${EMOJI.crown} Emerald Leaderboard`)
      .setDescription(rows.length ? rows.join('\n') : '*No players yet. Be the first to verify!*')
      .setFooter({ text: `Top 10 • CreativeMode.net` })
      .setTimestamp();
  },

  // ── Admin: give/take emeralds ──────────────────────────────────────
  adminEmeraldEmbed(action, targetUser, amount, newBalance, admin) {
    const isGive = action === 'give';
    return new EmbedBuilder()
      .setColor(isGive ? COLORS.green : COLORS.red)
      .setTitle(`${EMOJI.admin} Admin: Emerald ${isGive ? 'Grant' : 'Deduction'}`)
      .addFields(
        { name: 'Target', value: `<@${targetUser.id}>`, inline: true },
        { name: 'Amount', value: `${isGive ? '+' : '-'}${amount} ${EMOJI.emerald}`, inline: true },
        { name: 'New Balance', value: `${newBalance} ${EMOJI.emerald}`, inline: true },
        { name: 'Admin', value: `<@${admin.id}>`, inline: true },
      )
      .setFooter(FOOTER)
      .setTimestamp();
  },

  // ── Error embed ────────────────────────────────────────────────────
  errorEmbed(message) {
    return new EmbedBuilder()
      .setColor(COLORS.red)
      .setTitle(`${EMOJI.error} Error`)
      .setDescription(message)
      .setFooter(FOOTER);
  },

  // ── Success embed ──────────────────────────────────────────────────
  successEmbed(message) {
    return new EmbedBuilder()
      .setColor(COLORS.green)
      .setTitle(`${EMOJI.success} Success`)
      .setDescription(message)
      .setFooter(FOOTER);
  },

  // ── Backup complete embed ──────────────────────────────────────────
  backupEmbed(admin, filename, stats) {
    return new EmbedBuilder()
      .setColor(COLORS.purple)
      .setTitle(`${EMOJI.backup} Server Backup Complete`)
      .setDescription(`A full backup has been saved successfully.`)
      .addFields(
        { name: '💾 File', value: `\`${filename}\``, inline: false },
        { name: `${EMOJI.admin} Performed By`, value: `<@${admin.id}>`, inline: true },
        { name: '👥 Players', value: `${stats.players}`, inline: true },
        { name: '🧩 Mod Requests', value: `${stats.modRequests}`, inline: true },
        { name: '🎫 Tickets', value: `${stats.tickets}`, inline: true },
        { name: '💰 Transactions', value: `${stats.transactions}`, inline: true },
      )
      .setFooter(FOOTER)
      .setTimestamp();
  },
};
