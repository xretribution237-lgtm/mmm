// src/commands/modstatus.js
// =============================================
// Handles admin mod request button interactions
// (Start, Complete, Reject) and /modstatus cmd
// ADMIN ONLY
// =============================================

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { modOps, playerOps, transactionOps } = require('../database/db');
const { modRequestEmbed, errorEmbed, successEmbed } = require('../utils/embeds');
const { requireAdmin, isAdmin, auditLog } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('modstatus')
    .setDescription('🛡️ Update a mod request status (Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o
      .setName('request_id')
      .setDescription('Mod request ID (first 8 chars or full UUID)')
      .setRequired(true)
    )
    .addStringOption(o => o
      .setName('status')
      .setDescription('New status')
      .setRequired(true)
      .addChoices(
        { name: '▶️ In Progress', value: 'in-progress' },
        { name: '✅ Completed',   value: 'completed' },
        { name: '❌ Rejected',    value: 'rejected' },
      )
    ),

  async execute(interaction, client) {
    if (!await requireAdmin(interaction)) return;
    await interaction.deferReply({ ephemeral: true });

    const inputId = interaction.options.getString('request_id').trim();
    const status  = interaction.options.getString('status');

    const request = modOps.get.get(inputId) || findByShortId(inputId);
    if (!request) {
      return interaction.editReply({ embeds: [errorEmbed(`Mod request \`${inputId}\` not found.`)] });
    }

    await applyStatusChange(client, interaction.user, request, status);
    await interaction.editReply({ embeds: [successEmbed(`Request \`${request.id.slice(0, 8).toUpperCase()}\` marked as **${status}**.`)] });
  },

  // ── Button handler (called from interactionCreate.js) ─────────────
  async handleButton(interaction, client, action, args) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '🔒 Only admins can update mod requests.', ephemeral: true });
    }

    const requestId = args[0];
    const request = modOps.get.get(requestId);
    if (!request) {
      return interaction.reply({ content: '❌ Request not found.', ephemeral: true });
    }

    const statusMap = {
      mod_start:   'in-progress',
      mod_approve: 'completed',
      mod_reject:  'rejected',
    };

    const status = statusMap[action];
    if (!status) return;

    await interaction.deferUpdate();
    await applyStatusChange(client, interaction.user, request, status, interaction);
  },
};

// ── Shared logic ───────────────────────────────────────────────────────
async function applyStatusChange(client, admin, request, status, buttonInteraction = null) {
  modOps.updateStatus.run({
    status,
    assigned_to: admin.id,
    id: request.id,
  });

  const updated = modOps.get.get(request.id);

  // If rejected, refund emeralds (unless it was a free request)
  if (status === 'rejected' && !request.is_free && request.emerald_cost > 0) {
    playerOps.updateEmeralds.run({ user_id: request.user_id, amount: request.emerald_cost });
    transactionOps.log.run({
      user_id: request.user_id,
      amount: request.emerald_cost,
      type: 'refund',
      reason: `mod_rejected:${request.id}`,
      ref_id: request.id,
      performed_by: admin.id,
    });

    // Notify user of refund
    try {
      const user = await client.users.fetch(request.user_id);
      await user.send({
        embeds: [{
          color: 0xF57C00,
          title: '🔄 Mod Request Rejected — Refund Issued',
          description:
            `Your mod request **"${request.title}"** has been rejected by the admin team.\n\n` +
            `**Refund:** +${request.emerald_cost} ❇️ Emeralds returned to your balance.\n\n` +
            `Open a ticket if you'd like to discuss this.`,
          footer: { text: 'CreativeMode.net' },
          timestamp: new Date().toISOString(),
        }],
      });
    } catch (_) {}
  }

  // Notify user of completion
  if (status === 'completed') {
    try {
      const user = await client.users.fetch(request.user_id);
      await user.send({
        embeds: [{
          color: 0x00C853,
          title: '🎉 Mod Request Completed!',
          description:
            `Your mod **"${request.title}"** has been completed!\n\n` +
            `Our team will deliver it to you shortly.\n` +
            `Open a ticket if you have any questions.`,
          footer: { text: 'CreativeMode.net' },
          timestamp: new Date().toISOString(),
        }],
      });
    } catch (_) {}
  }

  // Update the embed in #mod-requests
  if (updated.message_id && updated.channel_id) {
    try {
      const ch  = await client.channels.fetch(updated.channel_id);
      const msg = await ch.messages.fetch(updated.message_id);
      if (msg) {
        // Remove buttons if final state
        const components = (status === 'completed' || status === 'rejected') ? [] : msg.components;
        await msg.edit({ embeds: [modRequestEmbed(updated, { id: request.user_id })], components });
      }
    } catch (_) {}
  }

  // Audit
  await auditLog(client, `MOD_${status.toUpperCase().replace('-', '_')}`, admin.id, request.user_id, {
    requestId: request.id,
    title: request.title,
  });
}

function findByShortId(shortId) {
  // Not ideal for large datasets, but fine for a community server
  const { db } = require('../database/db');
  return db.prepare(`SELECT * FROM mod_requests WHERE id LIKE ?`).get(`${shortId}%`);
}
