// events/interactionCreate.js
// =============================================
// Routes slash commands and button interactions
// =============================================

const { Events, InteractionType,
  MessageFlags,
} = require('discord.js');

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction, client) {
    // ── Slash Commands ─────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction, client);
      } catch (err) {
        console.error(`[CMD] Error in /${interaction.commandName}:`, err);
        const msg = { content: '❌ An error occurred. Please try again.', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg).catch(() => {});
        } else {
          await interaction.reply(msg).catch(() => {});
        }
      }
      return;
    }

    // ── Button Interactions ────────────────────────────────────────
    if (interaction.isButton()) {
      const [action, ...args] = interaction.customId.split(':');

      // Open ticket button
      if (action === 'open_ticket') {
        const ticketCmd = client.commands.get('ticket');
        if (ticketCmd?.handleButton) {
          await ticketCmd.handleButton(interaction, client, args);
        }
        return;
      }

      // Close ticket button
      if (action === 'close_ticket') {
        const ticketCmd = client.commands.get('ticket');
        if (ticketCmd?.handleClose) {
          await ticketCmd.handleClose(interaction, client, args);
        }
        return;
      }

      // Mod request status buttons (admin only)
      if (action === 'mod_approve' || action === 'mod_reject' || action === 'mod_start') {
        const modCmd = client.commands.get('modstatus');
        if (modCmd?.handleButton) {
          await modCmd.handleButton(interaction, client, action, args);
        }
        return;
      }

      // modconfirm / modcancel are handled inline inside requestmod.js via
      // awaitMessageComponent collectors. If the collector expired, catch it:
      if (action === 'modconfirm' || action === 'modcancel') {
        await interaction.reply({
          content: '⏱️ This preview has expired. Run `/requestmod` again.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return;
      }
    }
  },
};
