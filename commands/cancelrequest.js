// commands/cancelrequest.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { modOps, playerOps, transactionOps } = require('../database/db');
const { COLORS, FOOTER, errorEmbed, successEmbed } = require('../utils/embeds');
const { auditLog } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cancelrequest')
    .setDescription('❌ Cancel a pending mod request and get refunded')
    .addStringOption(o => o.setName('id').setDescription('Request ID (first 8 characters)').setRequired(true)),

  async execute(interaction, client) {
    const userId  = interaction.user.id;
    const inputId = interaction.options.getString('id').trim().toLowerCase();

    const request = modOps.get.get(inputId) ||
      require('../database/db').db.prepare(`SELECT * FROM mod_requests WHERE LOWER(id) LIKE ?`).get(`${inputId}%`);

    if (!request) return interaction.reply({ embeds: [errorEmbed(`Request \`${inputId.toUpperCase()}\` not found.`)], flags: MessageFlags.Ephemeral });
    if (request.user_id !== userId) return interaction.reply({ embeds: [errorEmbed('You can only cancel your own requests.')], flags: MessageFlags.Ephemeral });
    if (request.status !== 'pending') return interaction.reply({ embeds: [errorEmbed(`This request is already \`${request.status.toUpperCase()}\` and cannot be cancelled.`)], flags: MessageFlags.Ephemeral });

    const refundAmount = request.is_free ? 0 : request.emerald_cost;

    const confirmId = `cancel_confirm:${userId}`;
    const cancelId  = `cancel_abort:${userId}`;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(confirmId).setLabel('✅ Yes, Cancel & Refund').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(cancelId).setLabel('❌ Keep Request').setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder().setColor(COLORS.orange)
          .setTitle('⚠️ Cancel Mod Request?')
          .addFields(
            { name: '📋 Title',   value: request.title,                                       inline: true },
            { name: '🔖 ID',      value: `\`${request.id.slice(0,8).toUpperCase()}\``,       inline: true },
            { name: '💰 Refund',  value: refundAmount > 0 ? `+${refundAmount} ❇️` : 'None (was free)', inline: true },
          )
          .setFooter({ text: 'Expires in 60s • Mod Makers' }).setTimestamp(),
      ],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });

    const filter = i => i.user.id === userId && (i.customId === confirmId || i.customId === cancelId);
    let btn;
    try { btn = await interaction.channel.awaitMessageComponent({ filter, time: 60_000 }); }
    catch { return interaction.editReply({ embeds: [errorEmbed('Timed out.')], components: [] }).catch(() => {}); }

    if (btn.customId === cancelId) return btn.update({ embeds: [successEmbed('Request kept. No changes made.')], components: [] });

    await btn.deferUpdate();

    modOps.updateStatus.run({ status: 'rejected', assigned_to: userId, id: request.id });

    if (refundAmount > 0) {
      playerOps.updateEmeralds.run({ user_id: userId, amount: refundAmount });
      transactionOps.log.run({ user_id: userId, amount: refundAmount, type: 'refund', reason: `user_cancelled:${request.id}`, ref_id: request.id, performed_by: userId });
    }

    await auditLog(client, 'MOD_REQUEST_CANCELLED', userId, null, { requestId: request.id, refund: refundAmount });

    await interaction.editReply({
      embeds: [
        new EmbedBuilder().setColor(COLORS.green).setTitle('✅ Request Cancelled')
          .setDescription(`Your request **"${request.title}"** has been cancelled.${refundAmount > 0 ? `\n\n**+${refundAmount} ❇️** refunded to your balance.` : ''}`)
          .setFooter(FOOTER).setTimestamp(),
      ],
      components: [],
    });
  },
};
