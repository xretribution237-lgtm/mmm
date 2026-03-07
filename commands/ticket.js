// src/commands/ticket.js
// =============================================
// /ticket — Open a support ticket
// Also handles the "Open Ticket" button in the
// ticket panel, and "Close Ticket" button.
// =============================================

const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const { ticketOps, playerOps } = require('../database/db');
const { ticketOpenEmbed, errorEmbed, successEmbed } = require('../utils/embeds');
const { isAdmin, auditLog } = require('../utils/permissions');

const MAX_OPEN_TICKETS = 1; // Per user

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('🎫 Open a private support ticket')
    .addStringOption(o => o
      .setName('subject')
      .setDescription('What is your ticket about?')
      .setRequired(true)
      .setMaxLength(100)
    ),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });
    await openTicket(interaction, client, interaction.options.getString('subject'));
  },

  // ── Button: "Open a Ticket" from panel ────────────────────────────
  async handleButton(interaction, client) {
    await interaction.showModal({
      customId: 'ticket_modal',
      title: '🎫 Open a Support Ticket',
      components: [{
        type: 1,
        components: [{
          type: 4,
          customId: 'ticket_subject',
          label: 'What do you need help with?',
          style: 2,
          placeholder: 'e.g. I want to buy more Emeralds / Issue with my mod request...',
          required: true,
          maxLength: 200,
        }],
      }],
    });

    // Handle modal submit
    try {
      const modal = await interaction.awaitModalSubmit({ time: 60_000 });
      const subject = modal.fields.getTextInputValue('ticket_subject');
      await modal.deferReply({ ephemeral: true });
      await openTicket(modal, client, subject);
    } catch {
      // Timed out
    }
  },

  // ── Button: "Close Ticket" ─────────────────────────────────────────
  async handleClose(interaction, client) {
    const channel = interaction.channel;
    const ticket  = ticketOps.getByChannel.get(channel.id);

    if (!ticket) {
      return interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
    }

    // Only ticket owner or admin can close
    if (ticket.user_id !== interaction.user.id && !isAdmin(interaction.member)) {
      return interaction.reply({ content: '🔒 Only the ticket creator or an admin can close this.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    ticketOps.close.run({ closed_by: interaction.user.id, channel_id: channel.id });

    await channel.send({
      embeds: [{
        color: 0xD32F2F,
        title: '🔒 Ticket Closed',
        description: `This ticket was closed by <@${interaction.user.id}>.\n\nThis channel will be deleted in **5 seconds**.`,
        timestamp: new Date().toISOString(),
      }],
    });

    await auditLog(client, 'TICKET_CLOSED', interaction.user.id, ticket.user_id, { channelId: channel.id });

    setTimeout(async () => {
      try { await channel.delete(); } catch (_) {}
    }, 5000);

    await interaction.editReply({ embeds: [successEmbed('Ticket closed.')] });
  },
};

// ── Shared ticket creation logic ───────────────────────────────────────
async function openTicket(interaction, client, subject) {
  const userId = interaction.user.id;

  // Must be verified
  const player = playerOps.get.get(userId);
  if (!player || !player.verified) {
    return interaction.editReply({
      embeds: [errorEmbed('You must verify before opening a ticket.')],
    });
  }

  // Check open ticket limit
  const openCount = ticketOps.getOpenCount.get(userId);
  if (openCount.count >= MAX_OPEN_TICKETS) {
    return interaction.editReply({
      embeds: [errorEmbed(`You already have an open ticket. Please wait for it to be resolved before opening another.`)],
    });
  }

  const guild = interaction.guild;
  const ticketCatId = process.env.TICKETS_CATEGORY_ID;
  const adminRoleId = process.env.ADMIN_ROLE_ID;
  const modRoleId   = process.env.MOD_ROLE_ID;
  const ticketId    = uuidv4();
  const shortId     = ticketId.slice(0, 8).toUpperCase();

  // Create private channel
  const permOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
  ];
  if (adminRoleId) permOverwrites.push({ id: adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
  if (modRoleId)   permOverwrites.push({ id: modRoleId,   allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });

  let ticketChannel;
  try {
    ticketChannel = await guild.channels.create({
      name: `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}-${shortId}`,
      type: ChannelType.GuildText,
      parent: ticketCatId || undefined,
      permissionOverwrites: permOverwrites,
      reason: `Ticket opened by ${interaction.user.tag}`,
    });
  } catch (err) {
    console.error('[TICKET] Failed to create channel:', err);
    return interaction.editReply({ embeds: [errorEmbed('Failed to create ticket channel. Please contact an admin.')] });
  }

  // Save to DB
  ticketOps.create.run({ id: ticketId, user_id: userId, channel_id: ticketChannel.id, subject });

  // Close button
  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('🔒 Close Ticket')
      .setStyle(ButtonStyle.Danger)
  );

  await ticketChannel.send({
    content: `<@${userId}> ${adminRoleId ? `<@&${adminRoleId}>` : ''}`,
    embeds: [ticketOpenEmbed(interaction.user, subject, ticketId)],
    components: [closeRow],
  });

  await auditLog(client, 'TICKET_OPENED', userId, null, { ticketId, subject, channelId: ticketChannel.id });

  await interaction.editReply({
    embeds: [successEmbed(`✅ Your ticket has been opened in ${ticketChannel}!`)],
  });
}
