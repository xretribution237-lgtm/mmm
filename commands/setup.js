// src/commands/setup.js
// =============================================
// /setup — One-time server initialization
// Creates all channels, categories, roles,
// sends verify embed, ticket panel, etc.
// ADMIN ONLY
// =============================================

const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const { requireAdmin, auditLog } = require('../utils/permissions');
const { verifyEmbed, ticketPanelEmbed, successEmbed, errorEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('🛠️ Initialize the CreativeMode server (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    if (!await requireAdmin(interaction)) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    const botMember = guild.members.me;

    try {
      // ── 1. Create Roles ──────────────────────────────────────────
      const roleDefs = [
        { name: '👑 Admin',       color: 0xD32F2F, hoist: true,  position: 10 },
        { name: '🛡️ Moderator',   color: 0x7B1FA2, hoist: true,  position: 9  },
        { name: '💎 Premium',     color: 0xFFD700, hoist: true,  position: 8  },
        { name: '✅ Verified',    color: 0x00C853, hoist: false, position: 2  },
        { name: '🔴 Unverified',  color: 0x757575, hoist: false, position: 1  },
      ];

      const roles = {};
      for (const def of roleDefs) {
        const existing = guild.roles.cache.find(r => r.name === def.name);
        const role = existing ?? await guild.roles.create({
          name: def.name,
          color: def.color,
          hoist: def.hoist,
          reason: 'CreativeMode setup',
        });
        roles[def.name] = role;
      }

      const verifiedRole    = roles['✅ Verified'];
      const unverifiedRole  = roles['🔴 Unverified'];
      const adminRole       = roles['👑 Admin'];
      const modRole         = roles['🛡️ Moderator'];

      // ── 2. Create Categories & Channels ─────────────────────────

      // Deny everyone from seeing anything until verified
      const everyoneDeny = [PermissionFlagsBits.ViewChannel];
      const verifiedAllow = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory];
      const adminAllow = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages];

      // ── WELCOME category (visible to everyone, even unverified) ──
      const welcomeCat = await guild.channels.create({
        name: '👋 Welcome',
        type: ChannelType.GuildCategory,
      });

      // #verify — visible to everyone
      const verifyChannel = await guild.channels.create({
        name: '✅・verify',
        type: ChannelType.GuildText,
        parent: welcomeCat.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
          { id: botMember.id, allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions] },
        ],
      });

      // #rules — read-only for verified
      const rulesChannel = await guild.channels.create({
        name: '📜・rules',
        type: ChannelType.GuildText,
        parent: welcomeCat.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: everyoneDeny },
          { id: verifiedRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
          { id: adminRole.id, allow: adminAllow },
        ],
      });

      // #announcements — read-only for verified
      const announcementsChannel = await guild.channels.create({
        name: '📢・announcements',
        type: ChannelType.GuildText,
        parent: welcomeCat.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: everyoneDeny },
          { id: verifiedRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
          { id: adminRole.id, allow: adminAllow },
        ],
      });

      // ── COMMUNITY category ────────────────────────────────────────
      const communityCat = await guild.channels.create({
        name: '💬 Community',
        type: ChannelType.GuildCategory,
      });

      const generalChannel = await guild.channels.create({
        name: '💬・general',
        type: ChannelType.GuildText,
        parent: communityCat.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: everyoneDeny },
          { id: verifiedRole.id, allow: verifiedAllow },
        ],
      });

      await guild.channels.create({
        name: '🖼️・showcase',
        type: ChannelType.GuildText,
        topic: 'Share your mods and creations here!',
        parent: communityCat.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: everyoneDeny },
          { id: verifiedRole.id, allow: verifiedAllow },
        ],
      });

      await guild.channels.create({
        name: '💡・suggestions',
        type: ChannelType.GuildText,
        topic: 'Suggest features or improvements for Mod Makers',
        parent: communityCat.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: everyoneDeny },
          { id: verifiedRole.id, allow: verifiedAllow },
        ],
      });

      await guild.channels.create({
        name: '🐛・bug-reports',
        type: ChannelType.GuildText,
        topic: 'Report bugs with mods or the bot here',
        parent: communityCat.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: everyoneDeny },
          { id: verifiedRole.id, allow: verifiedAllow },
        ],
      });

      const leaderboardChannel = await guild.channels.create({
        name: '👑・leaderboard',
        type: ChannelType.GuildText,
        parent: communityCat.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: everyoneDeny },
          { id: verifiedRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
          { id: botMember.id, allow: adminAllow },
        ],
      });

      // ── ECONOMY category ──────────────────────────────────────────
      const economyCat = await guild.channels.create({
        name: '💰 Economy',
        type: ChannelType.GuildCategory,
      });

      await guild.channels.create({
        name: '❇️・emerald-info',
        type: ChannelType.GuildText,
        topic: 'Learn about Emeralds and how the economy works',
        parent: economyCat.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: everyoneDeny },
          { id: verifiedRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
          { id: adminRole.id, allow: adminAllow },
          { id: botMember.id, allow: adminAllow },
        ],
      });

      await guild.channels.create({
        name: '🎮・games',
        type: ChannelType.GuildText,
        topic: 'Use /coinflip and /trivia here to earn Emeralds!',
        parent: economyCat.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: everyoneDeny },
          { id: verifiedRole.id, allow: verifiedAllow },
        ],
      });

      // ── MOD PLATFORM category ─────────────────────────────────────
      const modCat = await guild.channels.create({
        name: '🧩 Mod Platform',
        type: ChannelType.GuildCategory,
      });

      const modRequestsChannel = await guild.channels.create({
        name: '🧩・mod-requests',
        type: ChannelType.GuildText,
        parent: modCat.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: everyoneDeny },
          { id: verifiedRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
          { id: adminRole.id, allow: adminAllow },
          { id: modRole.id, allow: adminAllow },
          { id: botMember.id, allow: adminAllow },
        ],
      });

      const ticketsChannel = await guild.channels.create({
        name: '🎫・open-a-ticket',
        type: ChannelType.GuildText,
        parent: modCat.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: everyoneDeny },
          { id: verifiedRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
          { id: botMember.id, allow: adminAllow },
        ],
      });

      // Tickets category (private channels land here)
      const ticketsCat = await guild.channels.create({
        name: '🔒 Tickets',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: everyoneDeny },
          { id: adminRole.id, allow: adminAllow },
          { id: modRole.id, allow: adminAllow },
          { id: botMember.id, allow: adminAllow },
        ],
      });

      // ── ADMIN category (hidden from everyone except admins) ───────
      const adminCat = await guild.channels.create({
        name: '🛡️ Admin',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: everyoneDeny },
          { id: adminRole.id, allow: adminAllow },
          { id: modRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
          { id: botMember.id, allow: adminAllow },
        ],
      });

      const adminLogChannel = await guild.channels.create({
        name: '📋・admin-log',
        type: ChannelType.GuildText,
        parent: adminCat.id,
      });

      const backupsChannel = await guild.channels.create({
        name: '💾・backups',
        type: ChannelType.GuildText,
        parent: adminCat.id,
      });

      // ── 3. Send embeds into channels ─────────────────────────────

      // Verify embed
      const verifyMsg = await verifyChannel.send({ embeds: [verifyEmbed()] });
      await verifyMsg.react('✅');

      // Rules embed
      await rulesChannel.send({
        embeds: [{
          color: 0x00C853,
          title: '📜 Server Rules',
          description:
            '**1.** Be respectful to all members.\n' +
            '**2.** No spamming or flooding channels.\n' +
            '**3.** Mod requests must be submitted via `/requestmod`.\n' +
            '**4.** Do not share personal information.\n' +
            '**5.** No harassment, hate speech, or NSFW content.\n' +
            '**6.** Emerald purchases are final — no chargebacks.\n' +
            '**7.** Breaking rules may result in a ban.\n\n' +
            '*By staying in this server you agree to these rules.*',
          footer: { text: 'Mod Makers' },
          timestamp: new Date().toISOString(),
        }],
      });

      // Ticket panel
      const ticketRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('open_ticket')
          .setLabel('🎫 Open a Ticket')
          .setStyle(ButtonStyle.Primary)
      );
      await ticketsChannel.send({ embeds: [ticketPanelEmbed()], components: [ticketRow] });

      // Welcome message in general
      await generalChannel.send({
        embeds: [{
          color: 0x00C853,
          title: '👋 Welcome to Mod Makers!',
          description:
            'This is the official Discord for **Mod Makers** — the community mod platform.\n\n' +
            '❇️ Use `/balance` to check your Emeralds\n' +
            '🧩 Use `/requestmod` to submit a mod\n' +
            '🎫 Use `/ticket` to get support\n' +
            '👑 Use `/leaderboard` to see top earners',
          footer: { text: 'Mod Makers' },
          timestamp: new Date().toISOString(),
        }],
      });

      // ── 4. Post channel/role IDs to admin log ────────────────────
      const setupSummary = [
        `**Setup Complete!** Copy these IDs to your Railway Variables:`,
        ``,
        `\`VERIFIED_ROLE_ID\` = ${verifiedRole.id}`,
        `\`UNVERIFIED_ROLE_ID\` = ${unverifiedRole.id}`,
        `\`ADMIN_ROLE_ID\` = ${adminRole.id}`,
        `\`MOD_ROLE_ID\` = ${modRole.id}`,
        `\`VERIFY_CHANNEL_ID\` = ${verifyChannel.id}`,
        `\`GENERAL_CHANNEL_ID\` = ${generalChannel.id}`,
        `\`ANNOUNCEMENTS_CHANNEL_ID\` = ${announcementsChannel.id}`,
        `\`RULES_CHANNEL_ID\` = ${rulesChannel.id}`,
        `\`MOD_REQUESTS_CHANNEL_ID\` = ${modRequestsChannel.id}`,
        `\`LEADERBOARD_CHANNEL_ID\` = ${leaderboardChannel.id}`,
        `\`TICKETS_CATEGORY_ID\` = ${ticketsCat.id}`,
        `\`ADMIN_LOG_CHANNEL_ID\` = ${adminLogChannel.id}`,
      ].join('\n');

      await adminLogChannel.send({ content: setupSummary });

      // ── 5. Audit log ──────────────────────────────────────────────
      await auditLog(client, 'SETUP_RUN', interaction.user.id, null, { guild: guild.name });

      await interaction.editReply({
        embeds: [successEmbed(
          `✅ **Setup complete!**\n\nAll channels, roles, and embeds have been created.\n\nCheck <#${adminLogChannel.id}> for the IDs to add to your Railway Variables, then redeploy.`
        )],
      });

    } catch (err) {
      console.error('[SETUP] Error:', err);
      await interaction.editReply({ embeds: [errorEmbed(`Setup failed: ${err.message}`)] });
    }
  },
};
