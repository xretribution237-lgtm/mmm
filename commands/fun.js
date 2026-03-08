// commands/fun.js
// coinflip, trivia
const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { playerOps, transactionOps } = require('../database/db');
const { COLORS, FOOTER, errorEmbed } = require('../utils/embeds');

// ── TRIVIA QUESTIONS ───────────────────────────────────────────────────
const TRIVIA = [
  { q: 'How many wool blocks do you need to craft a bed?', a: '3', wrong: ['2', '4', '6'] },
  { q: 'What item is needed to tame a wolf?', a: 'Bone', wrong: ['Fish', 'Meat', 'String'] },
  { q: 'What is the maximum level for enchantments in vanilla Minecraft?', a: '30', wrong: ['50', '20', '100'] },
  { q: 'How many obsidian blocks are needed to build a Nether portal?', a: '10', wrong: ['8', '12', '14'] },
  { q: 'What mob drops the Elytra?', a: 'Shulker', wrong: ['Enderman', 'Blaze', 'Wither'] },
  { q: 'What food fully restores your hunger bar in Minecraft?', a: 'Enchanted Golden Apple', wrong: ['Steak', 'Porkchop', 'Golden Apple'] },
  { q: 'What is the rarest ore in vanilla Minecraft?', a: 'Ancient Debris', wrong: ['Diamond', 'Emerald', 'Amethyst'] },
  { q: 'How many bookshelves do you need to get a level 30 enchant?', a: '15', wrong: ['10', '20', '30'] },
  { q: 'What biome do you find Allays in?', a: 'Pillager Outpost or Woodland Mansion', wrong: ['Jungle', 'Ocean', 'Desert'] },
  { q: 'What is the health of the Ender Dragon?', a: '200', wrong: ['100', '150', '300'] },
  { q: 'How many eyes of ender does it take to activate The End portal?', a: '12', wrong: ['8', '10', '16'] },
  { q: 'What material is a Smithing Table made from?', a: 'Iron ingots and planks', wrong: ['Gold and stone', 'Diamonds and planks', 'Iron and stone'] },
  { q: 'What mob is the only source of a Trident?', a: 'Drowned', wrong: ['Zombie', 'Skeleton', 'Guardian'] },
  { q: 'What do you feed a Strider to breed it?', a: 'Warped Fungus', wrong: ['Crimson Fungus', 'Nether Wart', 'Blaze Powder'] },
  { q: 'At what Y level does Diamonds most commonly spawn in 1.18+?', a: '-58', wrong: ['-16', '12', '-64'] },
];

const TRIVIA_REWARD = 15;
const COINFLIP_MIN  = 5;
const COINFLIP_MAX  = 50;

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

// ── /coinflip ──────────────────────────────────────────────────────────
const coinflip = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('🪙 Bet Emeralds on a coin flip — win or lose!')
    .addIntegerOption(o => o.setName('bet').setDescription(`Bet amount (${COINFLIP_MIN}–${COINFLIP_MAX} ❇️)`).setRequired(true).setMinValue(COINFLIP_MIN).setMaxValue(COINFLIP_MAX))
    .addStringOption(o => o.setName('side').setDescription('Heads or Tails?').setRequired(true).addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })),

  async execute(interaction) {
    const userId = interaction.user.id;
    const bet    = interaction.options.getInteger('bet');
    const choice = interaction.options.getString('side');
    const player = playerOps.get.get(userId);

    if (!player || !player.verified) return interaction.reply({ embeds: [errorEmbed('You must verify first.')], flags: MessageFlags.Ephemeral });
    if (player.emeralds < bet) return interaction.reply({ embeds: [errorEmbed(`You only have **${player.emeralds} ❇️**. Bet less!`)], flags: MessageFlags.Ephemeral });

    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won    = result === choice;

    playerOps.updateEmeralds.run({ user_id: userId, amount: won ? bet : -bet });
    transactionOps.log.run({
      user_id: userId, amount: won ? bet : -bet, type: won ? 'grant' : 'spend',
      reason: `coinflip_${won ? 'win' : 'loss'}`, ref_id: null, performed_by: 'system',
    });

    const newBalance = playerOps.get.get(userId).emeralds;

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(won ? COLORS.green : COLORS.red)
          .setTitle(won ? '🪙 You Won!' : '🪙 You Lost!')
          .setDescription(
            `The coin landed on **${result === 'heads' ? '🟡 Heads' : '⚪ Tails'}**!\n\n` +
            `You chose **${choice}** — ${won ? '✅ Correct!' : '❌ Wrong!'}\n` +
            `${won ? `**+${bet} ❇️** added to your balance!` : `**-${bet} ❇️** removed from your balance.`}`
          )
          .addFields({ name: '💰 New Balance', value: `${newBalance} ❇️`, inline: true })
          .setFooter(FOOTER).setTimestamp(),
      ],
    });
  },
};

// ── /trivia ────────────────────────────────────────────────────────────
const trivia = {
  data: new SlashCommandBuilder()
    .setName('trivia')
    .setDescription(`🧠 Answer a Minecraft trivia question to earn ${TRIVIA_REWARD} ❇️`),

  async execute(interaction) {
    const userId = interaction.user.id;
    const player = playerOps.get.get(userId);

    if (!player || !player.verified) return interaction.reply({ embeds: [errorEmbed('You must verify first.')], flags: MessageFlags.Ephemeral });

    const question  = TRIVIA[Math.floor(Math.random() * TRIVIA.length)];
    const choices   = shuffle([question.a, ...question.wrong]);
    const correctId = `trivia_${choices.indexOf(question.a)}:${userId}`;

    const row = new ActionRowBuilder().addComponents(
      choices.map((c, i) =>
        new ButtonBuilder()
          .setCustomId(`trivia_${i}:${userId}`)
          .setLabel(c)
          .setStyle(ButtonStyle.Primary)
      )
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder().setColor(COLORS.blue)
          .setTitle('🧠 Minecraft Trivia')
          .setDescription(`**${question.q}**\n\nPick the correct answer for **+${TRIVIA_REWARD} ❇️**!`)
          .setFooter({ text: 'You have 30 seconds • Mod Makers' }).setTimestamp(),
      ],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });

    const filter = i => i.user.id === userId && i.customId.startsWith('trivia_') && i.customId.endsWith(`:${userId}`);
    let btn;
    try { btn = await interaction.channel.awaitMessageComponent({ filter, time: 30_000 }); }
    catch {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLORS.orange).setTitle('⏱️ Time\'s Up!')
          .setDescription(`The correct answer was **${question.a}**.`).setFooter(FOOTER)],
        components: [],
      }).catch(() => {});
    }

    await btn.deferUpdate();
    const correct = btn.customId === correctId;

    if (correct) {
      playerOps.updateEmeralds.run({ user_id: userId, amount: TRIVIA_REWARD });
      transactionOps.log.run({ user_id: userId, amount: TRIVIA_REWARD, type: 'grant', reason: 'trivia_correct', ref_id: null, performed_by: 'system' });
    }

    const newBalance = playerOps.get.get(userId).emeralds;

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(correct ? COLORS.green : COLORS.red)
          .setTitle(correct ? '🎉 Correct!' : '❌ Wrong Answer')
          .setDescription(
            `**${question.q}**\n\n` +
            `The correct answer was **${question.a}**.\n\n` +
            (correct ? `**+${TRIVIA_REWARD} ❇️** added to your balance!` : 'Better luck next time!')
          )
          .addFields({ name: '💰 Balance', value: `${newBalance} ❇️`, inline: true })
          .setFooter(FOOTER).setTimestamp(),
      ],
      components: [],
    });
  },
};

module.exports = { coinflip, trivia };
