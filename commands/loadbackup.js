// commands/loadbackup.js
// =============================================
// /loadbackup — Restore DB from a saved backup
// Shows a list of saved backups to choose from.
// Restores players, mod requests, transactions.
// ADMIN ONLY — extremely destructive, careful!
// =============================================

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  AttachmentBuilder,
} = require('discord.js');

const { db, backupOps, auditOps } = require('../database/db');
const { requireAdmin, auditLog } = require('../utils/permissions');
const { errorEmbed, successEmbed, COLORS, FOOTER } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loadbackup')
    .setDescription('💾 Restore the server from a saved backup (Admin — use with care!)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addAttachmentOption(o => o
      .setName('file')
      .setDescription('Upload the backup .json file to restore from')
      .setRequired(true)
    ),

  async execute(interaction, client) {
    if (!await requireAdmin(interaction)) return;

    await interaction.deferReply({ ephemeral: true });

    const attachment = interaction.options.getAttachment('file');

    // ── Validate file ──────────────────────────────────────────────
    if (!attachment.name.endsWith('.json')) {
      return interaction.editReply({
        embeds: [errorEmbed('❌ Invalid file. You must upload a `.json` backup file created by `/backup`.')],
      });
    }

    if (attachment.size > 5_000_000) {
      return interaction.editReply({
        embeds: [errorEmbed('❌ File too large. Max backup size is 5MB.')],
      });
    }

    // ── Fetch and parse the backup file ───────────────────────────
    let backupData;
    try {
      const res  = await fetch(attachment.url);
      const text = await res.text();
      backupData = JSON.parse(text);
    } catch (err) {
      return interaction.editReply({
        embeds: [errorEmbed(`❌ Failed to read backup file: ${err.message}`)],
      });
    }

    // ── Validate backup structure ──────────────────────────────────
    if (!backupData?.meta || !backupData?.data) {
      return interaction.editReply({
        embeds: [errorEmbed('❌ Invalid backup file format. This does not look like a CreativeMode backup.')],
      });
    }

    const { meta, stats, data } = backupData;

    // ── Show preview embed with Confirm / Cancel ───────────────────
    const previewEmbed = new EmbedBuilder()
      .setColor(COLORS.orange)
      .setTitle('⚠️ Backup Restore — Confirm')
      .setDescription(
        `> **This will OVERWRITE current server data.**\n> This action cannot be undone.\n\n` +
        `**Backup Details:**`
      )
      .addFields(
        { name: '📅 Created',       value: `<t:${Math.floor(new Date(meta.createdAt).getTime() / 1000)}:F>`, inline: true },
        { name: '👤 Created By',    value: meta.createdBy,    inline: true },
        { name: '🏠 Server',        value: meta.guildName,    inline: true },
        { name: '👥 Players',       value: `${stats?.players ?? data.players?.length ?? '?'}`,      inline: true },
        { name: '🧩 Mod Requests',  value: `${stats?.modRequests ?? data.modRequests?.length ?? '?'}`, inline: true },
        { name: '💰 Transactions',  value: `${stats?.transactions ?? data.transactions?.length ?? '?'}`, inline: true },
        { name: '📝 Note',          value: meta.note || '*No note*', inline: false },
      )
      .setFooter({ text: 'This preview expires in 60 seconds • CreativeMode.net' })
      .setTimestamp();

    const confirmId = `loadbackup_confirm:${interaction.user.id}`;
    const cancelId  = `loadbackup_cancel:${interaction.user.id}`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel('✅ Yes, Restore This Backup')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(cancelId)
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({ embeds: [previewEmbed], components: [row] });

    // ── Wait for confirmation ──────────────────────────────────────
    const filter = i => i.user.id === interaction.user.id &&
      (i.customId === confirmId || i.customId === cancelId);

    let btn;
    try {
      btn = await interaction.channel.awaitMessageComponent({ filter, time: 60_000 });
    } catch {
      return interaction.editReply({
        embeds: [errorEmbed('⏱️ Restore timed out. No changes were made.')],
        components: [],
      }).catch(() => {});
    }

    if (btn.customId === cancelId) {
      await btn.update({
        embeds: [errorEmbed('❌ Restore cancelled. No changes were made.')],
        components: [],
      });
      return;
    }

    await btn.deferUpdate();

    // ── Perform the restore inside a transaction ───────────────────
    try {
      db.transaction(() => {
        // Clear existing data
        db.prepare('DELETE FROM players').run();
        db.prepare('DELETE FROM mod_requests').run();
        db.prepare('DELETE FROM transactions').run();
        db.prepare('DELETE FROM tickets').run();

        // Restore players
        const insertPlayer = db.prepare(`
          INSERT OR REPLACE INTO players
          (user_id, username, emeralds, verified, free_mod_used, joined_at, updated_at)
          VALUES (@user_id, @username, @emeralds, @verified, @free_mod_used, @joined_at, @updated_at)
        `);
        for (const p of (data.players ?? [])) insertPlayer.run(p);

        // Restore mod requests
        const insertMod = db.prepare(`
          INSERT OR REPLACE INTO mod_requests
          (id, user_id, title, description, mod_type, emerald_cost, status, is_free,
           assigned_to, channel_id, message_id, created_at, updated_at)
          VALUES (@id, @user_id, @title, @description, @mod_type, @emerald_cost, @status,
                  @is_free, @assigned_to, @channel_id, @message_id, @created_at, @updated_at)
        `);
        for (const m of (data.modRequests ?? [])) insertMod.run(m);

        // Restore transactions
        const insertTx = db.prepare(`
          INSERT OR REPLACE INTO transactions
          (id, user_id, amount, type, reason, ref_id, performed_by, created_at)
          VALUES (@id, @user_id, @amount, @type, @reason, @ref_id, @performed_by, @created_at)
        `);
        for (const t of (data.transactions ?? [])) insertTx.run(t);

        // Restore tickets
        const insertTicket = db.prepare(`
          INSERT OR REPLACE INTO tickets
          (id, user_id, channel_id, subject, status, created_at, closed_at, closed_by)
          VALUES (@id, @user_id, @channel_id, @subject, @status, @created_at, @closed_at, @closed_by)
        `);
        for (const tk of (data.tickets ?? [])) insertTicket.run(tk);
      })();

      // Log restore to audit
      backupOps.log.run({
        performed_by: interaction.user.id,
        file_path: attachment.name,
        note: `RESTORE from backup: ${meta.createdAt}`,
      });

      await auditLog(client, 'BACKUP_RESTORED', interaction.user.id, null, {
        filename: attachment.name,
        originalCreatedAt: meta.createdAt,
        originalCreatedBy: meta.createdBy,
        playersRestored: data.players?.length ?? 0,
        modRequestsRestored: data.modRequests?.length ?? 0,
      });

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.green)
            .setTitle('✅ Backup Restored Successfully')
            .addFields(
              { name: '👥 Players Restored',      value: `${data.players?.length ?? 0}`,      inline: true },
              { name: '🧩 Mod Requests Restored', value: `${data.modRequests?.length ?? 0}`,  inline: true },
              { name: '💰 Transactions Restored', value: `${data.transactions?.length ?? 0}`, inline: true },
            )
            .setDescription(`Server data has been restored from the backup created on **${meta.createdAt}**.`)
            .setFooter(FOOTER)
            .setTimestamp(),
        ],
        components: [],
      });

    } catch (err) {
      console.error('[LOADBACKUP] Restore failed:', err);
      await interaction.editReply({
        embeds: [errorEmbed(`❌ Restore failed mid-way: ${err.message}\n\nThe database may be in a partial state. Run \`/backup\` immediately and contact a developer.`)],
        components: [],
      });
    }
  },
};
