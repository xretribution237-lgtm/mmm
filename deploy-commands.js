// deploy-commands.js
// =============================================
// Run this ONCE to register slash commands:
//   node deploy-commands.js
//
// Needs BOT_TOKEN, CLIENT_ID, GUILD_ID in .env
// =============================================

require('dotenv').config();

const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');

// ── Validate env vars ──────────────────────────────────────────────────
const { BOT_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!BOT_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('❌ Missing BOT_TOKEN, CLIENT_ID, or GUILD_ID in your .env file.');
  process.exit(1);
}

// ── Load all command definitions ───────────────────────────────────────
const commands = [];
const commandsDir = path.join(__dirname, 'commands');

for (const file of fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'))) {
  const mod = require(path.join(commandsDir, file));

  if (mod.data) {
    // Single command export
    commands.push(mod.data.toJSON());
  } else {
    // Multi-command export e.g. emeralds.js exports { give, take }
    for (const key of Object.keys(mod)) {
      if (mod[key]?.data) {
        commands.push(mod[key].data.toJSON());
      }
    }
  }
}

// ── Register with Discord ──────────────────────────────────────────────
const rest = new REST().setToken(BOT_TOKEN);

(async () => {
  try {
    console.log(`🔄 Registering ${commands.length} slash commands to guild ${GUILD_ID}...`);

    const data = await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log(`\n✅ Successfully registered ${data.length} commands:`);
    data.forEach(cmd => console.log(`   /${cmd.name}`));
    console.log('\n✅ Done! Commands should appear in Discord within a few seconds.');

  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
})();
