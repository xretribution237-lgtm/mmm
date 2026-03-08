// commands/transfer.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { playerOps, transactionOps } = require('../database/db');
const { COLORS, FOOTER, errorEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('💸 Send Emeralds to another player')
    .addUserOption(o => o.setName('user').setDescription('Who to send to').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('How many Emeralds').setRequired(true).setMinValue(1).setMaxValue(10000)),

  async execute(interaction) {
    const userId   = interaction.user.id;
    const target   = interaction.options.getUser('user');
    const amount   = interaction.options.getInteger('amount');

    if (target.id === userId) return interaction.reply({ embeds: [errorEmbed("You can't send Emeralds to yourself.")], flags: MessageFlags.Ephemeral });
    if (target.bot)           return interaction.reply({ embeds: [errorEmbed("You can't send Emeralds to a bot.")], flags: MessageFlags.Ephemeral });

    const sender   = playerOps.get.get(userId);
    const receiver = playerOps.get.get(target.id);

    if (!sender || !sender.verified)   return interaction.reply({ embeds: [errorEmbed('You must verify first.')], flags: MessageFlags.Ephemeral });
    if (!receiver || !receiver.verified) return interaction.reply({ embeds: [errorEmbed(`<@${target.id}> hasn't verified yet.`)], flags: MessageFlags.Ephemeral });
    if (sender.emeralds < amount)      return interaction.reply({ embeds: [errorEmbed(`You only have **${sender.emeralds} ❇️**. You need **${amount} ❇️**.`)], flags: MessageFlags.Ephemeral });

    // Show preview with confirm/cancel
    const confirmId = `transfer_confirm:${userId}`;
    const cancelId  = `transfer_cancel:${userId}`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(confirmId).setLabel('✅ Confirm Transfer').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(cancelId).setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.orange)
          .setTitle('💸 Confirm Transfer')
          .addFields(
            { name: '📤 Sending To',     value: `<@${target.id}>`,          inline: true },
            { name: '💰 Amount',         value: `**${amount} ❇️**`,          inline: true },
            { name: '🏦 Your Balance',   value: `${sender.emeralds} ❇️`,    inline: true },
            { name: '📉 After Transfer', value: `${sender.emeralds - amount} ❇️`, inline: true },
          )
          .setFooter({ text: 'Expires in 60 seconds • Mod Makers' })
          .setTimestamp(),
      ],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });

    const filter = i => i.user.id === userId && (i.customId === confirmId || i.customId === cancelId);
    let btn;
    try { btn = await interaction.channel.awaitMessageComponent({ filter, time: 60_000 }); }
    catch { return interaction.editReply({ embeds: [errorEmbed('Transfer timed out.')], components: [] }).catch(() => {}); }

    if (btn.customId === cancelId) {
      return btn.update({ embeds: [errorEmbed('Transfer cancelled.')], components: [] });
    }

    await btn.deferUpdate();

    // Re-validate
    const freshSender = playerOps.get.get(userId);
    if (freshSender.emeralds < amount) {
      return interaction.editReply({ embeds: [errorEmbed('Insufficient balance at time of confirmation.')], components: [] });
    }

    // Atomic transfer
    playerOps.updateEmeralds.run({ user_id: userId,    amount: -amount });
    playerOps.updateEmeralds.run({ user_id: target.id, amount });
    transactionOps.log.run({ user_id: userId,    amount: -amount, type: 'transfer_out', reason: `transfer_to:${target.id}`,   ref_id: target.id,  performed_by: userId });
    transactionOps.log.run({ user_id: target.id, amount,          type: 'transfer_in',  reason: `transfer_from:${userId}`,    ref_id: userId,     performed_by: userId });

    const newBalance = playerOps.get.get(userId).emeralds;

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.green)
          .setTitle('✅ Transfer Complete')
          .addFields(
            { name: '📤 Sent To',      value: `<@${target.id}>`,  inline: true },
            { name: '💰 Amount',       value: `${amount} ❇️`,     inline: true },
            { name: '🏦 New Balance',  value: `${newBalance} ❇️`, inline: true },
          )
          .setFooter(FOOTER).setTimestamp(),
      ],
      components: [],
    });

    // Notify recipient
    try {
      await target.send({ embeds: [
        new EmbedBuilder().setColor(COLORS.green)
          .setTitle('💸 Emeralds Received!')
          .setDescription(`<@${userId}> sent you **${amount} ❇️ Emeralds**!\nNew balance: **${playerOps.get.get(target.id).emeralds} ❇️**`)
          .setFooter(FOOTER).setTimestamp(),
      ]});
    } catch (_) {}
  },
};
