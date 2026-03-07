// src/index.js
// =============================================
// CreativeMode Bot — Main Entry Point
// =============================================

require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
} = require('discord.js');
const fs   = require('fs');
const path = require('path');

// ── Validate required env vars ─────────────────────────────────────────
const REQUIRED_ENV = ['BOT_TOKEN', 'CLIENT_ID', 'GUILD_ID'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  console.error('   Copy .env.example to .env and fill in your values.');
  process.exit(1);
}

// ── Create client ──────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.GuildMember,
  ],
});

// ── Load commands ──────────────────────────────────────────────────────
client.commands = new Collection();
const commandsDir = path.join(__dirname, 'commands');

for (const file of fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'))) {
  const mod = require(path.join(commandsDir, file));

  if (mod.data && mod.execute) {
    // Single command export
    client.commands.set(mod.data.name, mod);
  } else {
    // Multi-command export (e.g. { give, take })
    for (const key of Object.keys(mod)) {
      const cmd = mod[key];
      if (cmd?.data && cmd?.execute) {
        client.commands.set(cmd.data.name, cmd);
      }
    }
  }
}

console.log(`📦 Loaded ${client.commands.size} commands: ${[...client.commands.keys()].map(n => `/${n}`).join(', ')}`);

// ── Load events ────────────────────────────────────────────────────────
const eventsDir = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsDir).filter(f => f.endsWith('.js'))) {
  const event = require(path.join(eventsDir, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

// ── Ready event ────────────────────────────────────────────────────────
client.once('ready', () => {
  console.log(`\n🟢 CreativeMode Bot online!`);
  console.log(`   Logged in as: ${client.user.tag}`);
  console.log(`   Serving guild: ${process.env.GUILD_ID}`);
  console.log(`   Commands registered: ${client.commands.size}`);
  console.log(`\n   Run /setup in your server to initialize everything!\n`);

  client.user.setActivity('CreativeMode.net | /requestmod', { type: 0 });
});

// ── Global error handlers ──────────────────────────────────────────────
process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]', err);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  // Don't crash on non-fatal errors
});

// ── Login ──────────────────────────────────────────────────────────────
client.login(process.env.BOT_TOKEN);
