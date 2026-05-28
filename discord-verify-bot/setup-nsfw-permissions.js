require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const GUILD_ID     = '964889268046692414';
const NSFW_ROLE_ID = '1508208171318116382';

const CATEGORY_IDS = [
  '965630147782901830',
  '964889268554182697',
  '1073305107774574693',
  '989990423885914172',
];

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
  // newly added
  '1461049076979204370',
  '964889444903702588',
  '1056131296272842832',
  '1160589942758592572',
  '964966238633726003',
  '1308526165560000522',
  '1262706006769532999',
  '1483830263355015168',
  '965630689837973515',
  '985359821995929661',
  '964990067829522443',
  '1103992968014209075',
  '967742049547870208',
  '1051017794688405514',
  '987270626865713172',
  '989132886739394560',
  '1156336239667060797',
  '1000859217403580436',
  '976442107281674250',
  '1334201371737456640',
  '1230617416610877440',
  '964889268554182699',
  '1254488218280136846',
  '1108282706959269929',
  '1226885499633926165',
];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const guild  = await client.guilds.fetch(GUILD_ID);
  await guild.roles.fetch();
  await guild.channels.fetch();

  const role = guild.roles.cache.get(NSFW_ROLE_ID);
  if (!role) {
    console.error('NSFW Only role not found! Check NSFW_ROLE_ID.');
    client.destroy();
    return;
  }
  console.log(`Role found: ${role.name}\n`);

  for (const id of [...CATEGORY_IDS, ...CHANNEL_IDS]) {
    try {
      const channel = guild.channels.cache.get(id);
      if (!channel) { console.warn(`Not found: ${id}`); continue; }

      await channel.permissionOverwrites.edit(role, { ViewChannel: true });
      console.log(`✅  ${channel.name}`);
    } catch (err) {
      console.error(`❌  ${id} — ${err.message}`);
    }
  }

  console.log('\nAll done! NSFW Only role permissions set.');
  client.destroy();
});

client.login(process.env.DISCORD_TOKEN);
