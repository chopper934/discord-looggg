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
  PresenceUpdateStatus
} from "discord.js";

const imageLogChannels = new Map<string, string>(); // لوق الصور المحذوفة
const stickerLogChannels = new Map<string, string>(); // لوق الستيكرات المحذوفة
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
  
  new SlashCommandBuilder()
  .setName('setlogimage')
  .setDescription('تحديد روم لوق الصور المحذوفة')
  .addChannelOption(o=>o.setName('روم').setDescription('منشن الروم').setRequired(true).addChannelTypes(ChannelType.GuildText))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  new SlashCommandBuilder()
  .setName('setlogsticker')
  .setDescription('تحديد روم لوق الستيكرات المحذوفة')
  .addChannelOption(o=>o.setName('روم').setDescription('منشن الروم').setRequired(true).addChannelTypes(ChannelType.GuildText))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  new SlashCommandBuilder()
  .setName('excludelog')
  .setDescription('استثناء روم من لوق الحذف')
  .addChannelOption(o=>o.setName('روم').setDescription('منشن الروم').setRequired(true).addChannelTypes(ChannelType.GuildText))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  new SlashCommandBuilder()
  .setName('excludelist')
  .setDescription('تشوف الرومات المستثناة')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  new SlashCommandBuilder()
  .setName('broadcast')
  .setDescription('إرسال برودكاست')
  .addStringOption(o=>o.setName('نوع').setDescription('مين ترسل له').setRequired(true).addChoices({name:'كل الأعضاء',value:'all'},{name:'المتصلين فقط',value:'online'},{name:'الأوفلاين فقط',value:'offline'}))
  .addStringOption(o=>o.setName('الرسالة').setDescription('الرسالة').setRequired(true))
  .addUserOption(o=>o.setName('يوزر').setDescription('شخص معين').setRequired(false))
  .addAttachmentOption(o=>o.setName('صورة').setDescription('ترفق صورة').setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(command => command.toJSON());

client.on("clientReady", async () => {
  console.log(`Logged in as ${client.user?.tag}!`);
  client.user?.setActivity('Dev By Cho', { type: 3 });
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN!);
  try {
    await rest.put(Routes.applicationCommands(client.user!.id), { body: commands });
    console.log('Slash commands loaded.');
  } catch (error) { console.error(error); }
});

process.on('unhandledRejection', error => console.error('Unhandled promise rejection:', error));
process.on('uncaughtException', error => console.error('Uncaught exception:', error));

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() ||!interaction.guild) return;
  try {
    if (interaction.commandName === 'ping') {
      const sent = await interaction.reply({ content: 'جاري حساب البينق...', fetchReply: true });
      interaction.editReply(`🏓 البينق: ${sent.createdTimestamp - interaction.createdTimestamp}ms | API: ${Math.round(client.ws.ping)}ms`);
    }
    
    if (interaction.commandName === 'setlogimage') {
      const channel = interaction.options.getChannel('روم', true);
      imageLogChannels.set(interaction.guild.id, channel.id);
      interaction.reply(`✅ تم تحديد ${channel} كروم لوق الصور المحذوفة.`);
    }
    
    if (interaction.commandName === 'setlogsticker') {
      const channel = interaction.options.getChannel('روم', true);
      stickerLogChannels.set(interaction.guild.id, channel.id);
      interaction.reply(`✅ تم تحديد ${channel} كروم لوق الستيكرات المحذوفة.`);
    }
    
    if (interaction.commandName === 'excludelog') {
      const channel = interaction.options.getChannel('روم', true);
      if (!excludedChannels.has(interaction.guild.id)) excludedChannels.set(interaction.guild.id, new Set());
      const excluded = excludedChannels.get(interaction.guild.id)!;
      if (excluded.has(channel.id)) {
        excluded.delete(channel.id);
        interaction.reply(`✅ تم إلغاء استثناء ${channel} من لوق الحذف.`);
      } else {
        excluded.add(channel.id);
        interaction.reply(`✅ تم استثناء ${channel} من لوق الحذف.`);
      }
    }
    
    if (interaction.commandName === 'excludelist') {
      const excluded = excludedChannels.get(interaction.guild.id);
      if (!excluded || excluded.size === 0) return interaction.reply("مافيه أي روم مستثنى حالياً.");
      const list = Array.from(excluded).map(id => `<#${id}>`).join("\n");
      interaction.reply(`**الرومات المستثناة من لوق الحذف:**\n${list}`);
    }
    
    if (interaction.commandName === 'broadcast') {
      await interaction.deferReply();
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
          const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(`📢 رسالة من إدارة ${interaction.guild.name}`).setDescription(text).setFooter({ text: `بواسطة ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() }).setTimestamp();
          if (attachment) embed.setImage(attachment.url);
          await member.send({ embeds: [embed] });
          count++;
        } catch {}
        await new Promise(r => setTimeout(r, 1000));
      }
      const targetText = targetUser? `العضو ${targetUser}` : type === "online"? "المتصلين" : type === "offline"? "الأوفلاين" : "كل الأعضاء";
      interaction.editReply(`✅ تم الإرسال لـ ${count} من ${targetText}.`);
    }
  } catch (err) {
    console.error("Error:", err);
    if (interaction.replied || interaction.deferred) {
      interaction.followUp({ content: '❌ صار خطأ', ephemeral: true });
    } else {
      interaction.reply({ content: '❌ صار خطأ', ephemeral: true });
    }
  }
});

// حدث الحذف - يرسل المحذوفات للوق المناسب
client.on("messageDelete", async (msg: Message | PartialMessage) => {
  try {
    if (msg.partial) {
      try {
        await msg.fetch();
      } catch {
        return;
      }
    }

    if (!msg.guild || msg.author?.bot) return;
    
    const isExcluded = excludedChannels.get(msg.guild.id)?.has(msg.channel.id);
    if (isExcluded) return;

    // 1. لوق الستيكرات المحذوفة
    if (msg.stickers.size > 0) {
      const stickerLogId = stickerLogChannels.get(msg.guild.id);
      if (stickerLogId) {
        const logChannel = msg.guild.channels.cache.get(stickerLogId);
        if (logChannel?.isTextBased()) {
          const sticker = msg.stickers.first()!;
          const embed = new EmbedBuilder()
          .setTitle("🗑️ ستيكر محذوف")
          .setDescription(`**الراسل:** ${msg.author}\n**اليوزر:** \`${msg.author.tag}\` - ${msg.author.id}`)
          .setColor(0xED4245)
          .addFields(
              { name: "الروم", value: `${msg.channel}`, inline: true },
              { name: "اسم الستيكر", value: `\`${sticker.name}\``, inline: true },
              { name: "وقت الحذف", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
            )
          .setThumbnail(msg.author.displayAvatarURL())
          .setImage(`https://cdn.discordapp.com/stickers/${sticker.id}.png`)
          .setFooter({ text: `Sticker ID: ${sticker.id}` })
          .setTimestamp();
          
          if (msg.content) embed.addFields({ name: "محتوى الرسالة", value: msg.content.slice(0, 1024) });
          await logChannel.send({ content: `⚠️ ستيكر محذوف من ${msg.author}`, embeds: [embed] });
        }
      }
    }

    // 2. لوق الصور/الفيديوهات المحذوفة
    if (msg.attachments.size > 0) {
      const imageLogId = imageLogChannels.get(msg.guild.id);
      if (imageLogId) {
        const logChannel = msg.guild.channels.cache.get(imageLogId);
        if (logChannel?.isTextBased()) {
          for (const att of msg.attachments.values()) {
            if (att.contentType?.startsWith("image/") || att.contentType?.startsWith("video/")) {
              const isVideo = att.contentType?.startsWith("video/");
              const embed = new EmbedBuilder()
              .setTitle(isVideo? "🗑️ فيديو محذوف" : "🗑️ صورة محذوفة")
              .setDescription(`**الراسل:** ${msg.author}\n**اليوزر:** \`${msg.author.tag}\` - ${msg.author.id}`)
              .setColor(0xED4245)
              .addFields(
                  { name: "الروم", value: `${msg.channel}`, inline: true },
                  { name: "اسم الملف", value: `\`${att.name}\``, inline: true },
                  { name: "وقت الحذف", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                  { name: "الحجم", value: `${(att.size / 1024 / 1024).toFixed(2)} MB`, inline: true },
                  { name: "الرابط الأصلي", value: `[تحميل الملف](${att.url})`, inline: true }
                )
              .setThumbnail(msg.author.displayAvatarURL())
              .setTimestamp();

              if (msg.content) embed.addFields({ name: "محتوى الرسالة", value: msg.content.slice(0, 1024) });

              if (isVideo) {
                await logChannel.send({ content: `⚠️ فيديو محذوف من ${msg.author}`, embeds: [embed], files: [att.url] });
              } else {
                embed.setImage(att.url);
                await logChannel.send({ content: `⚠️ صورة محذوفة من ${msg.author}`, embeds: [embed] });
              }
            }
          }
        }
      }
    }
  } catch (err) { 
    console.error("Error in messageDelete:", err); 
  }
});

client.login(process.env.TOKEN);
