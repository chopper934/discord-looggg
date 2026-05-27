import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  REST,
  Routes,
  PartialMessage,
  Message,
  PresenceUpdateStatus,
  ActivityType
} from "discord.js";

const imageLogChannels = new Map<string, string>();
const stickerLogChannels = new Map<string, string>();
const excludedChannels = new Map<string, Set<string>>();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
  partials: ["MESSAGE", "CHANNEL", "REACTION"]
});

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('يشوف سرعة البوت'),
  new SlashCommandBuilder().setName('setlogimage').setDescription('تحديد روم لوق الصور المحذوفة').addChannelOption(o=>o.setName('روم').setDescription('منشن الروم').setRequired(true).addChannelTypes(ChannelType.GuildText)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('setlogsticker').setDescription('تحديد روم لوق الستيكرات المحذوفة').addChannelOption(o=>o.setName('روم').setDescription('منشن الروم').setRequired(true).addChannelTypes(ChannelType.GuildText)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('excludelog').setDescription('استثناء روم من لوق الحذف').addChannelOption(o=>o.setName('روم').setDescription('منشن الروم').setRequired(true).addChannelTypes(ChannelType.GuildText)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('excludelist').setDescription('تشوف الرومات المستثناة').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('broadcast').setDescription('إرسال برودكاست').addStringOption(o=>o.setName('نوع').setDescription('مين ترسل له').setRequired(true).addChoices({name:'كل الأعضاء',value:'all'},{name:'المتصلين فقط',value:'online'},{name:'الأوفلاين فقط',value:'offline'})).addStringOption(o=>o.setName('الرسالة').setDescription('الرسالة').setRequired(true)).addUserOption(o=>o.setName('يوزر').setDescription('شخص معين').setRequired(false)).addAttachmentOption(o=>o.setName('صورة').setDescription('ترفق صورة').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(command => command.toJSON());

client.on("clientReady", async () => {
  console.log(`Logged in as ${client.user?.tag}!`);

  // بث مباشر مع الرابط اللي طلبته
  client.user?.setActivity('Dev By Cho', {
    type: ActivityType.Streaming,
    url: 'https://twitch.tv/cho'
  });

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN!);
  await rest.put(Routes.applicationCommands(client.user!.id), { body: commands });
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() ||!interaction.guild) return;
  try {
    if (interaction.commandName === 'ping') {
      const sent = await interaction.reply({ content: 'جاري حساب البينق...', fetchReply: true });
      interaction.editReply(`🏓 البينق: ${sent.createdTimestamp - interaction.createdTimestamp}ms | API: ${Math.round(client.ws.ping)}ms`);
    }

    if (interaction.commandName === 'broadcast') {
      await interaction.deferReply({ ephemeral: true });
      const type = interaction.options.getString('نوع', true);
      const text = interaction.options.getString('الرسالة', true);
      const targetUser = interaction.options.getUser('يوزر');
      const attachment = interaction.options.getAttachment('صورة');
      const members = await interaction.guild.members.fetch();
      let targets: any[] = [];

      if (targetUser) {
        const member = members.get(targetUser.id);
        if (member &&!member.user.bot) targets = [member];
      } else if (type === "online") {
        targets = members.filter(m =>!m.user.bot && m.presence?.status!== PresenceUpdateStatus.Offline);
      } else if (type === "offline") {
        targets = members.filter(m =>!m.user.bot && (!m.presence || m.presence.status === PresenceUpdateStatus.Offline));
      } else {
        targets = members.filter(m =>!m.user.bot);
      }

      let count = 0;
      for (const member of targets.values()) {
        try {
          // هنا التعديل - يرسل كأنك شخص عادي
          if (attachment) {
            await member.send({ content: text, files: [attachment.url] });
          } else {
            await member.send({ content: text });
          }
          count++;
        } catch {}
        await new Promise(r => setTimeout(r, 1000));
      }
      interaction.editReply(`✅ تم الإرسال لـ ${count}`);
    }

    // باقي الأوامر نفسها...
    if (interaction.commandName === 'setlogimage') {
      const channel = interaction.options.getChannel('روم', true);
      imageLogChannels.set(interaction.guild.id, channel.id);
      interaction.reply(`✅ تم تحديد ${channel}`);
    }
    if (interaction.commandName === 'setlogsticker') {
      const channel = interaction.options.getChannel('روم', true);
      stickerLogChannels.set(interaction.guild.id, channel.id);
      interaction.reply(`✅ تم تحديد ${channel}`);
    }
    if (interaction.commandName === 'excludelog') {
      const channel = interaction.options.getChannel('روم', true);
      if (!excludedChannels.has(interaction.guild.id)) excludedChannels.set(interaction.guild.id, new Set());
      const excluded = excludedChannels.get(interaction.guild.id)!;
      if (excluded.has(channel.id)) { excluded.delete(channel.id); interaction.reply(`✅ تم إلغاء استثناء ${channel}`); }
      else { excluded.add(channel.id); interaction.reply(`✅ تم استثناء ${channel}`); }
    }
  } catch (err) { console.error(err); }
});

// لوق الحذف - معدل للفيديوهات الطويلة
client.on("messageDelete", async (msg: Message | PartialMessage) => {
  try {
    if (msg.partial) await msg.fetch().catch(()=>null);
    if (!msg.guild || msg.author?.bot) return;
    if (excludedChannels.get(msg.guild.id)?.has(msg.channel.id)) return;

    // لوق الصور والفيديو
    if (msg.attachments.size > 0) {
      const logId = imageLogChannels.get(msg.guild.id);
      if (!logId) return;
      const logChannel = await msg.guild.channels.fetch(logId).catch(()=>null);
      if (!logChannel?.isTextBased()) return;

      for (const att of msg.attachments.values()) {
        if (!att.contentType?.startsWith("image/") &&!att.contentType?.startsWith("video/")) continue;

        const isVideo = att.contentType.startsWith("video/");
        const embed = new EmbedBuilder()
         .setTitle(isVideo? "🗑 فيديو محذوف" : "🗑 صورة محذوفة")
         .setDescription(`**من:** ${msg.author} (\`${msg.author.tag}\`)\n**الروم:** ${msg.channel}`)
         .setColor(0xED4245)
         .addFields(
            { name: "الملف", value: att.name, inline: true },
            { name: "الحجم", value: `${(att.size/1024/1024).toFixed(2)} MB`, inline: true }
          )
         .setThumbnail(msg.author.displayAvatarURL())
         .setTimestamp();

        if (msg.content) embed.addFields({ name: "النص", value: msg.content.slice(0, 1000) });

        try {
          // يحاول يرفع الملف كامل - حتى لو 100MB
          await logChannel.send({
            content: `${isVideo? '🎬' : '🖼️'} محذوف من ${msg.author}`,
            embeds: [embed],
            files: [{ attachment: att.url, name: att.name }]
          });
        } catch (error) {
          // لو فشل (السيرفر مو بوستد)، يرسل الرابط
          embed.addFields({ name: "رابط التحميل", value: att.url });
          await logChannel.send({
            content: `⚠️ ${isVideo? 'فيديو' : 'صورة'} كبير - ما قدرت أرفعه`,
            embeds: [embed]
          });
        }
      }
    }

    // لوق الستيكرات نفسه
    if (msg.stickers.size > 0) {
      const logId = stickerLogChannels.get(msg.guild.id);
      if (!logId) return;
      const logChannel = await msg.guild.channels.fetch(logId).catch(()=>null);
      if (!logChannel?.isTextBased()) return;
      const sticker = msg.stickers.first()!;
      const embed = new EmbedBuilder()
       .setTitle("🗑 ستيكر محذوف")
       .setDescription(`**من:** ${msg.author}\n**الروم:** ${msg.channel}`)
       .setImage(`https://cdn.discordapp.com/stickers/${sticker.id}.png`)
       .setColor(0xED4245)
       .setTimestamp();
      await logChannel.send({ embeds: [embed] });
    }

  } catch (e) { console.error("Delete log error:", e); }
});

client.login(process.env.TOKEN);
