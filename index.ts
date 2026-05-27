import {
  Client, GatewayIntentBits, Partials, Events,
  ActivityType, AttachmentBuilder, Message,
  TextChannel, EmbedBuilder
} from "discord.js";
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";
import fs from "fs";

// ===== قاعدة البيانات البسيطة =====
const DB_FILE = "./db.json";
interface DB {
  imageLogChannels: Record<string, string>;
  stickerLogChannels: Record<string, string>;
  excludedChannels: Record<string, string[]>;
}

let db: DB = { imageLogChannels: {}, stickerLogChannels: {}, excludedChannels: {} };
if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ===== إعداد البوت =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel, Partials.Message]
});

const TOKEN = process.env.TOKEN!;
const CLIENT_ID = process.env.CLIENT_ID!;

// ===== الأوامر =====
const commands = [
  {
    name: "ping",
    description: "يشوف سرعة استجابة البوت"
  },
  {
    name: "setlogimage",
    description: "حدد روم لوق الصور المحذوفة",
    options: [{ name: "channel", description: "الروم", type: 7, required: true }]
  },
  {
    name: "setlogsticker",
    description: "حدد روم لوق الستيكرات المحذوفة",
    options: [{ name: "channel", description: "الروم", type: 7, required: true }]
  },
  {
    name: "excludelog",
    description: "استثني روم من اللوق",
    options: [{ name: "channel", description: "الروم", type: 7, required: true }]
  },
  {
    name: "listexcluded",
    description: "اعرض كل الرومات المستثناة من اللوق"
  },
  {
    name: "broadcast",
    description: "ارسل رسالة لكل الأعضاء",
    options: [{ name: "message", description: "الرسالة", type: 3, required: true }]
  }
];

const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("✅ Slash commands ready");
  } catch (e) { console.error(e); }
})();

// ===== لما يشتغل البوت =====
client.once(Events.ClientReady, (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  c.user.setActivity({
    name: "cho",
    type: ActivityType.Streaming,
    url: "https://twitch.tv/cho"
  });
});

// ===== تنفيذ الأوامر =====
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isChatInputCommand() ||!i.guild) return;
  const gid = i.guild.id;

  if (i.commandName === "ping") {
    const sent = await i.reply({ content: "🏓 Pinging...", fetchReply: true });
    const ping = sent.createdTimestamp - i.createdTimestamp;
    const apiPing = Math.round(client.ws.ping);
    i.editReply(`🏓 Pong!\nسرعة البوت: \`${ping}ms\`\nسرعة الـ API: \`${apiPing}ms\``);
  }

  if (i.commandName === "setlogimage") {
    const ch = i.options.getChannel("channel") as TextChannel;
    db.imageLogChannels[gid] = ch.id;
    saveDB();
    i.reply({ content: `✅ لوق الصور/الفيديو: ${ch}`, ephemeral: true });
  }

  if (i.commandName === "setlogsticker") {
    const ch = i.options.getChannel("channel") as TextChannel;
    db.stickerLogChannels[gid] = ch.id;
    saveDB();
    i.reply({ content: `✅ لوق الستيكرات: ${ch}`, ephemeral: true });
  }

  if (i.commandName === "excludelog") {
    const ch = i.options.getChannel("channel") as TextChannel;
    if (!db.excludedChannels[gid]) db.excludedChannels[gid] = [];
    if (!db.excludedChannels[gid].includes(ch.id)) {
      db.excludedChannels[gid].push(ch.id);
      saveDB();
    }
    i.reply({ content: `✅ تم استثناء ${ch} من اللوق`, ephemeral: true });
  }

  if (i.commandName === "listexcluded") {
    const excluded = db.excludedChannels[gid] || [];
    if (excluded.length === 0)
      return i.reply({ content: "❌ ما فيه أي روم مستثنى حالياً", ephemeral: true });

    const list = excluded.map(id => `<#${id}>`).join("\n");
    i.reply({
      content: `📋 **الرومات المستثناة من اللوق:**\n${list}`,
      ephemeral: true
    });
  }

  if (i.commandName === "broadcast") {
    if (!i.memberPermissions?.has("Administrator"))
      return i.reply({ content: "❌ لازم أدمن", ephemeral: true });

    const msg = i.options.getString("message", true);
    await i.reply({ content: "⏳ جاري الإرسال...", ephemeral: true });

    const members = await i.guild.members.fetch();
    let done = 0, fail = 0;

    for (const [, m] of members) {
      if (m.user.bot) continue;
      try {
        await m.send(msg);
        done++;
      } catch { fail++; }
      await new Promise(r => setTimeout(r, 1000));
    }
    i.editReply(`✅ تم: ${done} | فشل: ${fail}`);
  }
});

// ===== لوق الصور + الفيديو + الستيكر المحذوفة =====
client.on(Events.MessageDelete, async (msg: Message) => {
  if (!msg.guild || msg.partial ||!msg.author) return;
  const gid = msg.guild.id;
  const logId = db.imageLogChannels[gid];
  if (!logId || db.excludedChannels[gid]?.includes(msg.channel.id)) return;

  const logCh = await msg.guild.channels.fetch(logId).catch(() => null) as TextChannel;
  if (!logCh) return;

  const files = msg.attachments.filter(a =>
    a.contentType?.startsWith("image/") ||
    a.contentType?.startsWith("video/")
  );
  const stickers = msg.stickers;
  if (files.size === 0 && stickers.size === 0) return;

  const maxSize = 100 * 1024 * 1024; // 100MB
  const deleteTime = `<t:${Math.floor(Date.now() / 1000)}:R>`; // 3 hours ago
  const userAvatar = msg.author.displayAvatarURL({ size: 128 });

  // لوق الصور والفيديو
  for (const [, att] of files) {
    const isVideo = att.contentType?.startsWith("video/");
    const type = isVideo? "فيديو" : "صورة";
    const sizeMB = (att.size / 1024 / 1024).toFixed(2);

    const embed = new EmbedBuilder()
     .setColor("#ff0000")
     .setAuthor({ name: `${type} محذوف ⚠️`, iconURL: userAvatar })
     .setThumbnail(userAvatar)
     .addFields(
        { name: "الراسل", value: `${msg.author}`, inline: true },
        { name: "اليوزر", value: `\`${msg.author.tag}\`\nID: \`${msg.author.id}\``, inline: true },
        { name: "الروم", value: `${msg.channel}`, inline: false },
        { name: "الحجم", value: `${sizeMB} MB`, inline: true },
        { name: "وقت الحذف", value: `${deleteTime}`, inline: true }
      )
     .setTimestamp();

    if (att.size <= maxSize) {
      embed.setImage(att.url);
      await logCh.send({ embeds: [embed] });
    } else {
      embed.addFields({ name: "الرابط", value: `[اضغط هنا](${att.url})`, inline: false });
      embed.setFooter({ text: "الملف أكبر من 100MB ما ينرفع" });
      await logCh.send({ embeds: [embed] });
    }
  }

  // لوق الستيكرات
  for (const [, sticker] of stickers) {
    const embed = new EmbedBuilder()
     .setColor("#ff0000")
     .setAuthor({ name: "ستيكر محذوف ⚠️", iconURL: userAvatar })
     .setThumbnail(userAvatar)
     .addFields(
        { name: "الراسل", value: `${msg.author}`, inline: true },
        { name: "اليوزر", value: `\`${msg.author.tag}\`\nID: \`${msg.author.id}\``, inline: true },
        { name: "الروم", value: `${msg.channel}`, inline: false },
        { name: "اسم الستيكر", value: `\`${sticker.name}\``, inline: true },
        { name: "وقت الحذف", value: `${deleteTime}`, inline: true }
      )
     .setImage(sticker.url)
     .setFooter({ text: `Sticker ID: ${sticker.id}` })
     .setTimestamp();

    await logCh.send({ embeds: [embed] });
  }
});

client.login(TOKEN);
