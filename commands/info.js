// commands/info.js
// serverinfo, userinfo, ping
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { playerOps, modOps, ticketOps, warningOps } = require('../database/db');
const { COLORS, FOOTER, errorEmbed } = require('../utils/embeds');

// ── /serverinfo ────────────────────────────────────────────────────────
const serverinfo = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('📊 View Mod Makers server statistics'),

  async execute(interaction) {
    const guild          = interaction.guild;
    const memberCount    = guild.memberCount;
    const verifiedCount  = playerOps.getVerifiedCount.get().count;
    const totalEmeralds  = playerOps.getTotalEmeralds.get().total ?? 0;
    const pendingMods    = modOps.getPendingCount.get().count;
    const openTickets    = ticketOps.getTotalOpen.get().count;

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.blue)
          .setTitle(`📊 ${guild.name} — Server Stats`)
          .setThumbnail(guild.iconURL())
          .addFields(
            { name: '👥 Total Members',     value: `${memberCount}`,      inline: true },
            { name: '✅ Verified Players',  value: `${verifiedCount}`,    inline: true },
            { name: '❇️ Emeralds in Circulation', value: `${totalEmeralds.toLocaleString()}`, inline: true },
            { name: '🧩 Pending Mod Requests', value: `${pendingMods}`,  inline: true },
            { name: '🎫 Open Tickets',       value: `${openTickets}`,     inline: true },
            { name: '📅 Server Created',     value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
          )
          .setFooter(FOOTER)
          .setTimestamp(),
      ],
    });
  },
};

// ── /userinfo ──────────────────────────────────────────────────────────
const userinfo = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('👤 View a player\'s full profile')
    .addUserOption(o => o.setName('user').setDescription('Player to look up (leave blank for yourself)').setRequired(false)),

  async execute(interaction) {
    const { isAdmin } = require('../utils/permissions');
    const targetUser  = interaction.options.getUser('user') || interaction.user;

    // Non-admins can only view their own profile
    if (targetUser.id !== interaction.user.id && !isAdmin(interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed('You can only view your own profile.')], flags: MessageFlags.Ephemeral });
    }

    const player   = playerOps.get.get(targetUser.id);
    const requests = player ? modOps.getByUser.all(targetUser.id) : [];
    const warnList = warningOps.getByUser.all(targetUser.id);

    let member;
    try { member = await interaction.guild.members.fetch(targetUser.id); } catch (_) {}

    const completed = requests.filter(r => r.status === 'completed').length;
    const pending   = requests.filter(r => r.status === 'pending').length;

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.blue)
          .setTitle(`👤 ${targetUser.username}`)
          .setThumbnail(targetUser.displayAvatarURL())
          .addFields(
            { name: '✅ Verified',       value: player?.verified ? 'Yes' : 'No',                  inline: true },
            { name: '❇️ Emeralds',       value: `${player?.emeralds ?? 0}`,                       inline: true },
            { name: '🆓 Free Mod',       value: player?.free_mod_used ? 'Used' : 'Available',     inline: true },
            { name: '🧩 Total Requests', value: `${requests.length}`,                              inline: true },
            { name: '🟢 Completed',      value: `${completed}`,                                   inline: true },
            { name: '🟡 Pending',        value: `${pending}`,                                     inline: true },
            { name: '⚠️ Warnings',       value: `${warnList.length}`,                             inline: true },
            { name: '📅 Joined Server',  value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>` : 'Unknown', inline: true },
            { name: '📅 Member Since',   value: player ? `<t:${Math.floor(new Date(player.joined_at).getTime()/1000)}:D>` : 'Not registered', inline: true },
          )
          .setFooter(FOOTER)
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

// ── /ping ──────────────────────────────────────────────────────────────
const ping = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('🏓 Check bot latency and uptime'),

  async execute(interaction, client) {
    const start   = Date.now();
    await interaction.deferReply();
    const latency = Date.now() - start;
    const wsLatency = client.ws.ping;
    const uptimeSec = Math.floor(process.uptime());
    const hours   = Math.floor(uptimeSec / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const seconds = uptimeSec % 60;

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(latency < 200 ? COLORS.green : latency < 500 ? COLORS.orange : COLORS.red)
          .setTitle('🏓 Pong!')
          .addFields(
            { name: '📡 API Latency',    value: `${latency}ms`,   inline: true },
            { name: '💓 WS Heartbeat',   value: `${wsLatency}ms`, inline: true },
            { name: '⏱️ Uptime',         value: `${hours}h ${minutes}m ${seconds}s`, inline: true },
          )
          .setFooter(FOOTER)
          .setTimestamp(),
      ],
    });
  },
};

module.exports = { serverinfo, userinfo, ping };
