require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const GUILD_ID     = '964889268046692414';
const NSFW_ROLE_ID = '1508208171318116382';

const CHANNEL_IDS = [
  '982978006643540018',
  '1389692337185095811',
  '965208348091899914',
  '1234139870965010564',
  '1110200566266740767',
  '1000159100191113320',
  '1002155883532394558',
  '1334592804781031568',
  '964972850182234172',
  '1070251605506666566',
  '967757400956342272',
  '1230616544577585306',
];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.channels.fetch();
  await guild.roles.fetch();

  const role = guild.roles.cache.get(NSFW_ROLE_ID);
  console.log(`Checking role: ${role?.name ?? 'NOT FOUND'}\n`);

  for (const id of CHANNEL_IDS) {
    const channel = guild.channels.cache.get(id);
    if (!channel) { console.log(`❓ ${id} — channel not found`); continue; }

    const overwrite = channel.permissionOverwrites.cache.get(NSFW_ROLE_ID);
    const parent    = channel.parent;
    const parentOW  = parent?.permissionOverwrites.cache.get(NSFW_ROLE_ID);

    const channelAllow = overwrite?.allow.has('ViewChannel') ? '✅ Allow' : overwrite?.deny.has('ViewChannel') ? '❌ Deny' : '➖ Not set';
    const categoryAllow = parentOW?.allow.has('ViewChannel') ? '✅ Allow' : parentOW?.deny.has('ViewChannel') ? '❌ Deny' : '➖ Not set';
    const synced = channel.permissionsLocked ? '🔗 Synced with category' : '🔓 Not synced';

    console.log(`#${channel.name}`);
    console.log(`  Channel override : ${channelAllow}`);
    console.log(`  Category (${parent?.name ?? 'none'}) : ${categoryAllow}`);
    console.log(`  Sync status      : ${synced}`);
    console.log('');
  }

  client.destroy();
});

client.login(process.env.DISCORD_TOKEN);
