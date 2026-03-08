// src/commands/backup.js
// =============================================
// /backup — Save a full DB backup + server snapshot
// Posts the backup file to #backups channel
// ADMIN ONLY
// =============================================

const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const { db, backupOps, auditOps } = require('../database/db');
const { backupEmbed, errorEmbed } = require('../utils/embeds');
const { requireAdmin, auditLog } = require('../utils/permissions');
const fs   = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('💾 Save a full server & database backup (Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o
      .setName('note')
      .setDescription('Optional note about this backup')
      .setRequired(false)
    ),

  async execute(interaction, client) {
    if (!await requireAdmin(interaction)) return;

    await interaction.deferReply({ ephemeral: true });

    const note     = interaction.options.getString('note') || '';
    const now      = new Date();
    const datePart = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `creativemode-backup-${datePart}.json`;
    const filePath = path.join(process.cwd(), 'data', filename);

    try {
      // ── Collect all DB data ───────────────────────────────────────
      const players      = db.prepare('SELECT * FROM players').all();
      const modRequests  = db.prepare('SELECT * FROM mod_requests').all();
      const transactions = db.prepare('SELECT * FROM transactions').all();
      const tickets      = db.prepare('SELECT * FROM tickets').all();
      const auditLogs    = db.prepare('SELECT * FROM audit_log').all();

      const backupData = {
        meta: {
          createdAt: now.toISOString(),
          createdBy: interaction.user.tag,
          guildId:   interaction.guild.id,
          guildName: interaction.guild.name,
          note,
          version: '1.0.0',
        },
        stats: {
          players:      players.length,
          modRequests:  modRequests.length,
          transactions: transactions.length,
          tickets:      tickets.length,
          auditLogs:    auditLogs.length,
        },
        data: { players, modRequests, transactions, tickets, auditLogs },
      };

      const jsonContent = JSON.stringify(backupData, null, 2);
      fs.writeFileSync(filePath, jsonContent, 'utf8');

      // ── Build Discord attachment ──────────────────────────────────
      const attachment = new AttachmentBuilder(filePath, { name: filename });

      // ── Post to #backups channel ──────────────────────────────────
      const backupsChannelId = process.env.ADMIN_LOG_CHANNEL_ID;
      let backupsChannel = null;
      if (backupsChannelId) {
        try {
          backupsChannel = await client.channels.fetch(backupsChannelId);
        } catch (_) {}
      }

      // Try to find #backups channel by name
      if (!backupsChannel) {
        backupsChannel = interaction.guild.channels.cache.find(c => c.name.includes('backup'));
      }

      if (backupsChannel) {
        await backupsChannel.send({
          embeds: [backupEmbed(interaction.user, filename, backupData.stats)],
          files: [attachment],
        });
      }

      // ── Log to DB ─────────────────────────────────────────────────
      backupOps.log.run({ performed_by: interaction.user.id, file_path: filePath, note });
      await auditLog(client, 'BACKUP_CREATED', interaction.user.id, null, { filename, note, stats: backupData.stats });

      // Reply to admin
      await interaction.editReply({
        content: `✅ **Backup saved!** File: \`${filename}\`\n${backupsChannel ? `Posted to ${backupsChannel}` : ''}`,
        files: [new AttachmentBuilder(filePath, { name: filename })],
      });

      // Clean up local file after sending
      setTimeout(() => {
        try { fs.unlinkSync(filePath); } catch (_) {}
      }, 10_000);

    } catch (err) {
      console.error('[BACKUP] Error:', err);
      await interaction.editReply({ embeds: [errorEmbed(`Backup failed: ${err.message}`)] });
    }
  },
};
