// src/commands/requestmod.js
// =============================================
// /requestmod — Submit a mod request
//
// FLOW:
//   1. User runs /requestmod with title+type+desc
//   2. Bot immediately shows a COST PREVIEW embed
//      (ephemeral) — exact cost, current balance,
//      balance after, free mod status. Two buttons:
//      ✅ Confirm  ❌ Cancel
//   3. Only on Confirm does the request get saved,
//      emeralds deducted, and admin embed posted.
//
// This prevents any accidental or disputed charges.
// The preview is shown BEFORE any emeralds move.
// =============================================

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const { playerOps, modOps } = require('../database/db');
const { modRequestEmbed, errorEmbed, successEmbed, COLORS, FOOTER } = require('../utils/embeds');
const { getModTypeChoices, getCost, getModType, MOD_TYPES } = require('../utils/modPricing');
const { auditLog } = require('../utils/permissions');

// ── Build the cost preview embed ──────────────────────────────────────
function buildPreviewEmbed(user, player, title, type, desc, cost, isFree) {
  const modInfo    = getModType(type);
  const balAfter   = isFree ? player.emeralds : player.emeralds - cost;
  const affordable = isFree || player.emeralds >= cost;
  const shortage   = affordable ? 0 : cost - player.emeralds;

  // Estimate complexity warning
  let complexityNote = '';
  if (cost >= 100) complexityNote = '\n> ⚠️ **High complexity mod** — admin may adjust cost after review.';
  else if (cost >= 50) complexityNote = '\n> ℹ️ **Medium complexity** — cost is fixed unless admin adjusts.';

  return new EmbedBuilder()
    .setColor(affordable ? COLORS.orange : COLORS.red)
    .setTitle(`${affordable ? '🧾' : '❌'} Mod Request — Cost Preview`)
    .setDescription(
      `> Please **review the cost breakdown** before confirming.\n> No Emeralds are charged until you click **Confirm**.${complexityNote}`
    )
    .addFields(
      { name: '📋 Title',           value: title,                                          inline: true  },
      { name: '🔧 Type',            value: `${modInfo?.emoji ?? ''} ${modInfo?.label}`,   inline: true  },
      { name: '\u200B',             value: '\u200B',                                       inline: true  },
      {
        name: '💰 Cost Breakdown',
        value: [
          `**Base price:** ${isFree ? '~~' + cost + ' ❇️~~ **FREE** (first mod)' : `**${cost} ❇️**`}`,
          `**Your balance now:** ${player.emeralds} ❇️`,
          affordable
            ? `**Balance after:** ${balAfter} ❇️`
            : `**Shortfall:** ❌ You need **${shortage} more ❇️**`,
        ].join('\n'),
        inline: false,
      },
      {
        name: '📝 Your Description',
        value: desc.length > 300 ? desc.slice(0, 297) + '...' : desc,
        inline: false,
      },
    )
    .addFields(
      affordable
        ? { name: '✅ Ready to submit', value: 'Click **Confirm** below to lock in this request and charge your Emeralds.', inline: false }
        : { name: '❌ Cannot submit', value: `You're short **${shortage} ❇️**. Open a ticket to purchase more Emeralds, then retry.`, inline: false }
    )
    .setFooter({ text: 'This preview expires in 2 minutes • CreativeMode.net' })
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('requestmod')
    .setDescription('🧩 Submit a mod request using your Emeralds')
    .addStringOption(o => o
      .setName('title')
      .setDescription('Short title for your mod')
      .setRequired(true)
      .setMaxLength(80)
    )
    .addStringOption(o => o
      .setName('type')
      .setDescription('What kind of mod is this?')
      .setRequired(true)
      .addChoices(...getModTypeChoices())
    )
    .addStringOption(o => o
      .setName('description')
      .setDescription('Detailed description of what you want')
      .setRequired(true)
      .setMaxLength(1000)
    ),

  async execute(interaction, client) {
    const userId  = interaction.user.id;
    const title   = interaction.options.getString('title');
    const type    = interaction.options.getString('type');
    const desc    = interaction.options.getString('description');
    const cost    = getCost(type);
    const modInfo = getModType(type);

    // ── Step 1: Validate player ──────────────────────────────────────
    const player = playerOps.get.get(userId);
    if (!player || !player.verified) {
      return interaction.reply({
        embeds: [errorEmbed('You must verify in <#' + (process.env.VERIFY_CHANNEL_ID || 'the verify channel') + '> before submitting mod requests.')],
        ephemeral: true,
      });
    }

    const isFree     = !player.free_mod_used;
    const affordable = isFree || player.emeralds >= cost;

    // ── Step 2: Show cost preview with Confirm / Cancel buttons ──────
    const confirmId = `modconfirm:${userId}:${type}`;
    const cancelId  = `modcancel:${userId}`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel('✅ Confirm & Submit')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!affordable),   // greyed out if they can't afford it
      new ButtonBuilder()
        .setCustomId(cancelId)
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({
      embeds: [buildPreviewEmbed(interaction.user, player, title, type, desc, cost, isFree)],
      components: [row],
      ephemeral: true,
    });

    // ── Step 3: Wait for button press (2 minute window) ──────────────
    const filter = i => i.user.id === userId && (i.customId === confirmId || i.customId === cancelId);
    let btnInteraction;
    try {
      btnInteraction = await interaction.channel.awaitMessageComponent({ filter, time: 120_000 });
    } catch {
      // Timed out — disable buttons
      await interaction.editReply({
        embeds: [errorEmbed('⏱️ Request timed out. No Emeralds were charged. Run `/requestmod` again when you\'re ready.')],
        components: [],
      }).catch(() => {});
      return;
    }

    // ── Step 4a: User cancelled ───────────────────────────────────────
    if (btnInteraction.customId === cancelId) {
      await btnInteraction.update({
        embeds: [errorEmbed('❌ Request cancelled. No Emeralds were charged.')],
        components: [],
      });
      return;
    }

    // ── Step 4b: User confirmed — re-validate in case balance changed ──
    await btnInteraction.deferUpdate();

    // Re-fetch fresh player state (race-condition safe)
    const freshPlayer = playerOps.get.get(userId);
    if (!freshPlayer) {
      return btnInteraction.editReply({ embeds: [errorEmbed('Player record not found. Contact an admin.')], components: [] });
    }

    const stillFree = !freshPlayer.free_mod_used;
    if (!stillFree && freshPlayer.emeralds < cost) {
      return interaction.editReply({
        embeds: [errorEmbed(
          `❌ **Balance changed before confirmation.**\n\n` +
          `You need **${cost} ❇️** but now only have **${freshPlayer.emeralds} ❇️**.\n` +
          `No Emeralds were charged.`
        )],
        components: [],
      });
    }

    // ── Step 5: Atomic submit ─────────────────────────────────────────
    const result = modOps.submitRequest(
      userId,
      interaction.user.username,
      { title, description: desc, mod_type: type },
      cost,
      stillFree
    );

    if (result.error) {
      const msgs = {
        insufficient_emeralds: `❌ Insufficient Emeralds. Need **${cost} ❇️**, have **${result.have ?? freshPlayer.emeralds} ❇️**.`,
        free_mod_used:         `❌ Your free mod was already used. This costs **${cost} ❇️**.`,
        not_verified:          `❌ You need to verify first.`,
      };
      return interaction.editReply({ embeds: [errorEmbed(msgs[result.error] ?? 'Submission failed.')], components: [] });
    }

    const updatedPlayer = playerOps.get.get(userId);

    // ── Step 6: Post in #mod-requests with admin action buttons ──────
    const request = {
      id: result.requestId,
      user_id: userId,
      title,
      description: desc,
      mod_type: type,
      emerald_cost: cost,
      is_free: stillFree ? 1 : 0,
      status: 'pending',
      assigned_to: null,
      created_at: new Date().toISOString(),
    };

    const adminRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mod_start:${result.requestId}`).setLabel('▶️ Start Working').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`mod_approve:${result.requestId}`).setLabel('✅ Mark Complete').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`mod_reject:${result.requestId}`).setLabel('❌ Reject').setStyle(ButtonStyle.Danger),
    );

    const modChannelId = process.env.MOD_REQUESTS_CHANNEL_ID;
    if (modChannelId) {
      try {
        const modChannel = await client.channels.fetch(modChannelId);
        const msg = await modChannel.send({
          embeds: [modRequestEmbed(request, interaction.user)],
          components: [adminRow],
        });
        modOps.setMessageId.run({ message_id: msg.id, channel_id: modChannelId, id: result.requestId });
      } catch (err) {
        console.error('[REQUESTMOD] Failed to post to mod-requests:', err);
      }
    }

    // ── Step 7: Audit + confirm to user ───────────────────────────────
    await auditLog(client, 'MOD_REQUEST_SUBMITTED', userId, null, {
      requestId: result.requestId,
      type,
      cost: stillFree ? 0 : cost,
      isFree: stillFree,
      balanceBefore: freshPlayer.emeralds,
      balanceAfter: updatedPlayer?.emeralds,
    });

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.green)
          .setTitle('🧩 Mod Request Submitted!')
          .addFields(
            { name: '📋 Title',           value: title,                                                               inline: true  },
            { name: '🔧 Type',            value: `${modInfo?.emoji ?? ''} ${modInfo?.label}`,                        inline: true  },
            { name: '💸 Charged',         value: stillFree ? '`FREE` ✨ (first mod)' : `**${cost} ❇️**`,             inline: true  },
            { name: '💰 Previous Balance',value: `${freshPlayer.emeralds} ❇️`,                                       inline: true  },
            { name: '💰 New Balance',     value: `${updatedPlayer?.emeralds ?? freshPlayer.emeralds} ❇️`,            inline: true  },
            { name: '🔖 Request ID',      value: `\`${result.requestId.slice(0, 8).toUpperCase()}\``,                inline: true  },
          )
          .setDescription(`Your request is now pending admin review. Track it in <#${modChannelId || 'mod-requests'}>.`)
          .setFooter(FOOTER)
          .setTimestamp(),
      ],
      components: [],
    });
  },
};
