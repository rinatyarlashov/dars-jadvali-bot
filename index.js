require('dotenv').config();

const axios = require('axios');
const XLSX = require('xlsx');
const path = require('path');
const dayjs = require('dayjs');
const { Telegraf } = require('telegraf');

const { openDb, initDb } = require('./db');
const { WEEKDAYS } = require('./keyboards');
const {
  isAdmin,
  adminMenu,
  setState,
  getState,
  clearState,
  promptDirections,
  promptCourses,
  promptGroups,
  promptWeekdays,
} = require('./admin');

// =====================
// ENV + INIT
// =====================
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('BOT_TOKEN yo‘q (.env ni tekshiring)');

const ADMIN_IDS = (process.env.ADMIN_IDS || '')
  .split(',')
  .map(s => Number(s.trim()))
  .filter(n => Number.isFinite(n));

const DB_PATH = process.env.DB_PATH || './data.db';

const bot = new Telegraf(BOT_TOKEN);

const db = openDb(DB_PATH);
initDb(db, path.join(__dirname, 'init.sql'));

// =====================
// HELPERS
// =====================
function excelTimeToHHMM(v) {
  if (v === null || v === undefined || v === '') return '';

  // "8:30:00" yoki "8:30"
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
    return v.trim();
  }

  // Excel time fraction: 0.3541666...
  if (typeof v === 'number' && isFinite(v)) {
    const totalMinutes = Math.round(v * 24 * 60);
    const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  // ba'zan Date bo'lib kelishi ham mumkin
  if (v instanceof Date && !isNaN(v.getTime())) {
    const hh = String(v.getHours()).padStart(2, '0');
    const mm = String(v.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  return String(v).trim();
}

function weekdayUzFromDate(date = new Date()) {
  // JS: 0=Sun..6=Sat -> Biz: 1=Mon..7=Sun
  const js = dayjs(date).day();
  return js === 0 ? 7 : js;
}

function formatLessons(lessons) {
  if (!lessons.length) return '❌ Bu kunga dars kiritilmagan.';

  // start_time bo'yicha tartiblab, indeksdan para raqam beramiz
  const sorted = [...lessons].sort((a, b) =>
    String(a.start_time).localeCompare(String(b.start_time)),
  );

  return sorted
    .map((l, idx) => {
      const para = idx + 1;
      const who = l.teacher ? `\n👨‍🏫 ${l.teacher}` : '';
      const room = l.room ? `\n🏫 ${l.room}` : '';
      const note = l.note ? `\n📝 ${l.note}` : '';
      return `📌 ${para}-para ⏰ ${l.start_time}-${l.end_time}\n📚 ${l.subject}${who}${room}${note}`;
    })
    .join('\n\n');
}

function mainMenuKb() {
  return {
    inline_keyboard: [
      [{ text: '📅 Jadvalni ko‘rish', callback_data: 'u:view' }],
      [{ text: '👨‍🏫 O‘qituvchini qidirish', callback_data: 'u:teacher' }],
      [{ text: 'ℹ️ Yordam', callback_data: 'u:help' }],
    ],
  };
}

// Telegram 400 "message is not modified" bo‘lsa bot yiqilib ketmasin
async function safeEditMessageText(ctx, text, extra) {
  try {
    return await ctx.editMessageText(text, extra);
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('message is not modified')) {
      // hech narsa qilmaymiz
      return;
    }
    throw e;
  }
}

function parseLessonLine(line) {
  // format: 09:00-10:20 | Algebra | Aliyev A.A | 203 | izoh
  const parts = line.split('|').map((s) => s.trim());
  if (parts.length < 2) return { ok: false, error: 'Format noto‘g‘ri.' };

  const time = parts[0];
  const [start_time, end_time] = time.split('-').map((s) => s.trim());
  if (!start_time || !end_time) {
    return { ok: false, error: 'Vaqt noto‘g‘ri. Masalan: 09:00-10:20' };
  }
  const timeRe = /^\d{1,2}:\d{2}$/;
  if (!timeRe.test(start_time) || !timeRe.test(end_time)) {
    return { ok: false, error: 'Vaqt formati HH:MM bo‘lsin. Masalan: 09:00-10:20' };
  }

  return {
    ok: true,
    start_time,
    end_time,
    subject: parts[1],
    teacher: parts[2] || null,
    room: parts[3] || null,
    note: parts[4] || null,
  };
}

// =====================
// START + BASIC COMMANDS
// =====================
bot.start(async (ctx) => {
  console.log('User:', ctx.from.id, ctx.from.username);
  clearState(ctx.from.id);

  const text = `Assalomu alaykum!
Men matematika fakulteti dars jadvali botiman.

📌 Jadvalni ko‘rish uchun: "Jadvalni ko‘rish" ni bosing.
${isAdmin(ctx, ADMIN_IDS) ? '\n✅ Siz adminsiz: /admin' : ''}`;

  await ctx.reply(text, { reply_markup: mainMenuKb() });
});

bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx, ADMIN_IDS)) return ctx.reply('❌ Siz admin emassiz.');
  clearState(ctx.from.id);
  return ctx.reply('🛠 Admin panel:', { reply_markup: adminMenu() });
});

// /teacher komandasi ham bo‘lsin (button bilan bir xil)
bot.command('teacher', async (ctx) => {
  clearState(ctx.from.id);
  setState(ctx.from.id, { step: 'teacher_search' });
  return ctx.reply(
    "👨‍🏫 O‘qituvchi qidirish\n\n" +
    "O‘qituvchi ism-familiyasini yozing.\n" +
    "Masalan: Aliyev A.A\n\n" +
    "Bekor qilish: /start",
    { reply_markup: mainMenuKb() },
  );
});

// =====================
// USER FLOW
// =====================
bot.action('u:view', async (ctx) => {
  await ctx.answerCbQuery();
  return safeEditMessageText(ctx, 'Yo‘nalishni tanlang:', {
    reply_markup: promptDirections(db, 'u'),
  });
});

bot.action(/^u:dir:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const dirId = Number(ctx.match[1]);
  return safeEditMessageText(ctx, 'Kursni tanlang:', {
    reply_markup: promptCourses('u', dirId),
  });
});

bot.action(/^u:course:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const dirId = Number(ctx.match[1]);
  const course = Number(ctx.match[2]);
  return safeEditMessageText(ctx, 'Guruhni tanlang:', {
    reply_markup: promptGroups(db, 'u', dirId, course),
  });
});

bot.action(/^u:group:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const groupId = Number(ctx.match[1]);

  const buttons = [
    [{ text: '📌 Bugun', callback_data: `u:day:${groupId}:today` }],
    [{ text: '➡️ Ertaga', callback_data: `u:day:${groupId}:tomorrow` }],
    [{ text: '📅 Haftalik (bitta xabar)', callback_data: `u:week:${groupId}` }],
    [{ text: '🗓 Haftalik (kun tanlash)', callback_data: `u:pickday:${groupId}` }],
    [{ text: '⬅️ Orqaga (yo‘nalishlar)', callback_data: 'u:view' }],
  ];

  return safeEditMessageText(ctx, 'Qaysi jadval kerak?', {
    reply_markup: { inline_keyboard: buttons },
  });
});

bot.action(/^u:pickday:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const groupId = Number(ctx.match[1]);
  return safeEditMessageText(ctx, 'Kunni tanlang:', {
    reply_markup: promptWeekdays('u', groupId),
  });
});

bot.action(/^u:wday:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const groupId = Number(ctx.match[1]);
  const weekday = Number(ctx.match[2]);

  const group = db.prepare('SELECT name FROM groups WHERE id=?').get(groupId);
  const dayName = WEEKDAYS.find((w) => w.id === weekday)?.name || 'Kun';

  const lessons = db
    .prepare('SELECT * FROM lessons WHERE group_id=? AND weekday=? ORDER BY start_time')
    .all(groupId, weekday);

  return safeEditMessageText(
    ctx,
    `📅 ${group?.name || 'Guruh'} — ${dayName}\n\n${formatLessons(lessons)}`,
    { reply_markup: mainMenuKb() },
  );
});

bot.action(/^u:day:(\d+):(today|tomorrow)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const groupId = Number(ctx.match[1]);
  const which = ctx.match[2];

  const date = which === 'today' ? new Date() : dayjs().add(1, 'day').toDate();
  const weekday = weekdayUzFromDate(date);

  const group = db.prepare('SELECT name FROM groups WHERE id=?').get(groupId);
  const dayName = WEEKDAYS.find((w) => w.id === weekday)?.name || 'Kun';

  const lessons = db
    .prepare('SELECT * FROM lessons WHERE group_id=? AND weekday=? ORDER BY start_time')
    .all(groupId, weekday);

  return safeEditMessageText(
    ctx,
    `📅 ${group?.name || 'Guruh'} — ${dayName}\n\n${formatLessons(lessons)}`,
    { reply_markup: mainMenuKb() },
  );
});

bot.action(/^u:week:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const groupId = Number(ctx.match[1]);

  const group = db.prepare('SELECT name FROM groups WHERE id=?').get(groupId);

  let text = `🗓 Haftalik jadval — ${group?.name || 'Guruh'}\n\n`;

  for (let weekday = 1; weekday <= 6; weekday++) {
    const dayName = WEEKDAYS.find((w) => w.id === weekday)?.name || `Kun ${weekday}`;

    const lessons = db
      .prepare('SELECT * FROM lessons WHERE group_id=? AND weekday=? ORDER BY start_time')
      .all(groupId, weekday);

    text += `📅 ${dayName}\n${formatLessons(lessons)}\n\n————————————\n\n`;
  }

  return safeEditMessageText(ctx, text.trim(), { reply_markup: mainMenuKb() });
});

bot.action('u:teacher', async (ctx) => {
  await ctx.answerCbQuery();
  clearState(ctx.from.id);
  setState(ctx.from.id, { step: 'teacher_search' });

  // editMessageText bilan "message is not modified" bo‘lsa ham yiqilmasin
  return safeEditMessageText(
    ctx,
    "👨‍🏫 O‘qituvchi qidirish\n\n" +
    "O‘qituvchi ism-familiyasini yozing.\n" +
    "Masalan: Aliyev A.A\n\n" +
    "Bekor qilish: /start",
    { reply_markup: mainMenuKb() },
  );
});

bot.action('u:help', async (ctx) => {
  await ctx.answerCbQuery();
  return safeEditMessageText(
    ctx,
    `ℹ️ Yordam
- Jadvalni ko‘rish: Menudan "Jadvalni ko‘rish"
- O‘qituvchi qidirish: Menudan "O‘qituvchini qidirish"
- Admin: /admin (faqat ADMIN_IDS dagilar)

Agar jadval chiqmasa — admin jadval kiritmagan bo‘lishi mumkin.`,
    { reply_markup: mainMenuKb() },
  );
});

bot.action('noop', (ctx) => ctx.answerCbQuery('Bu yerda amal yo‘q'));

// =====================
// ADMIN MENU ROOT
// =====================
bot.action(/^adm:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx, ADMIN_IDS)) return;

  const cmd = ctx.match[1];
  clearState(ctx.from.id);

  if (cmd === 'list_groups') {
    const rows = db
      .prepare(
        `
            SELECT g.id, d.name AS direction, g.course, g.name
            FROM groups g JOIN directions d ON d.id=g.direction_id
            ORDER BY d.name, g.course, g.name
        `,
      )
      .all();

    const text = rows.length
      ? rows.map((r) => `#${r.id} | ${r.direction} | ${r.course}-kurs | ${r.name}`).join('\n')
      : 'Hali guruh kiritilmagan.';

    return safeEditMessageText(ctx, `📋 Guruhlar:\n\n${text}`, { reply_markup: adminMenu() });
  }

  if (cmd === 'add_group') {
    setState(ctx.from.id, { step: 'add_group_dir' });
    return safeEditMessageText(ctx, 'Guruh qo‘shish: yo‘nalishni tanlang', {
      reply_markup: promptDirections(db, 'adm_addgrp'),
    });
  }

  if (cmd === 'del_group') {
    setState(ctx.from.id, { step: 'del_group_dir' });
    return safeEditMessageText(ctx, 'Guruh o‘chirish: yo‘nalishni tanlang', {
      reply_markup: promptDirections(db, 'adm_delgrp'),
    });
  }

  if (cmd === 'add_lesson') {
    setState(ctx.from.id, { step: 'add_lesson_dir' });
    return safeEditMessageText(ctx, 'Dars qo‘shish: yo‘nalishni tanlang', {
      reply_markup: promptDirections(db, 'adm_addles'),
    });
  }

  if (cmd === 'del_lesson') {
    setState(ctx.from.id, { step: 'del_lesson_dir' });
    return safeEditMessageText(ctx, 'Dars o‘chirish: yo‘nalishni tanlang', {
      reply_markup: promptDirections(db, 'adm_delles'),
    });
  }

  if (cmd === 'back') {
    clearState(ctx.from.id);
    return safeEditMessageText(ctx, '🛠 Admin panel:', { reply_markup: adminMenu() });
  }
});

bot.action('adm:back', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx, ADMIN_IDS)) return;
  clearState(ctx.from.id);
  return safeEditMessageText(ctx, '🛠 Admin panel:', { reply_markup: adminMenu() });
});

// =====================
// ADMIN: ADD GROUP
// =====================
bot.action(/^adm_addgrp:dir:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx, ADMIN_IDS)) return;

  const dirId = Number(ctx.match[1]);
  setState(ctx.from.id, { step: 'add_group_course', payload: { dirId } });

  return safeEditMessageText(ctx, 'Kursni tanlang:', {
    reply_markup: promptCourses('adm_addgrp', dirId),
  });
});

bot.action(/^adm_addgrp:course:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx, ADMIN_IDS)) return;

  const dirId = Number(ctx.match[1]);
  const course = Number(ctx.match[2]);

  setState(ctx.from.id, { step: 'add_group_name', payload: { dirId, course } });

  return safeEditMessageText(
    ctx,
    'Guruh nomini yozing.\nMasalan: 101, AM-12, SI-21\n\nBekor qilish: /admin',
    {
      reply_markup: { inline_keyboard: [[{ text: '⬅️ Admin menu', callback_data: 'adm:back' }]] },
    },
  );
});

// =====================
// ADMIN: DELETE GROUP
// =====================
bot.action(/^adm_delgrp:dir:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx, ADMIN_IDS)) return;

  const dirId = Number(ctx.match[1]);
  setState(ctx.from.id, { step: 'del_group_course', payload: { dirId } });

  return safeEditMessageText(ctx, 'Kursni tanlang:', {
    reply_markup: promptCourses('adm_delgrp', dirId),
  });
});

bot.action(/^adm_delgrp:course:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx, ADMIN_IDS)) return;

  const dirId = Number(ctx.match[1]);
  const course = Number(ctx.match[2]);

  return safeEditMessageText(ctx, 'O‘chiriladigan guruhni tanlang:', {
    reply_markup: promptGroups(db, 'adm_delgrp', dirId, course),
  });
});

bot.action(/^adm_delgrp:group:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx, ADMIN_IDS)) return;

  const groupId = Number(ctx.match[1]);
  const group = db.prepare('SELECT name FROM groups WHERE id=?').get(groupId);

  db.prepare('DELETE FROM groups WHERE id=?').run(groupId);
  clearState(ctx.from.id);

  return safeEditMessageText(ctx, `🗑 Guruh o‘chirildi: ${group?.name || groupId}`, {
    reply_markup: adminMenu(),
  });
});

// =====================
// ADMIN: ADD LESSON
// =====================
bot.action(/^adm_addles:dir:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx, ADMIN_IDS)) return;

  const dirId = Number(ctx.match[1]);
  setState(ctx.from.id, { step: 'add_lesson_course', payload: { dirId } });

  return safeEditMessageText(ctx, 'Kursni tanlang:', {
    reply_markup: promptCourses('adm_addles', dirId),
  });
});

bot.action(/^adm_addles:course:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx, ADMIN_IDS)) return;

  const dirId = Number(ctx.match[1]);
  const course = Number(ctx.match[2]);

  setState(ctx.from.id, { step: 'add_lesson_group', payload: { dirId, course } });

  return safeEditMessageText(ctx, 'Guruhni tanlang:', {
    reply_markup: promptGroups(db, 'adm_addles', dirId, course),
  });
});

bot.action(/^adm_addles:group:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx, ADMIN_IDS)) return;

  const groupId = Number(ctx.match[1]);
  setState(ctx.from.id, { step: 'add_lesson_weekday', payload: { groupId } });

  return safeEditMessageText(ctx, 'Kunni tanlang:', {
    reply_markup: promptWeekdays('adm_addles', groupId),
  });
});

bot.action(/^adm_addles:wday:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx, ADMIN_IDS)) return;

  const groupId = Number(ctx.match[1]);
  const weekday = Number(ctx.match[2]);

  setState(ctx.from.id, { step: 'add_lesson_details', payload: { groupId, weekday } });

  return safeEditMessageText(
    ctx,
    `Dars ma’lumotini 1 qatorda yozing (| bilan):
Namuna:
09:00-10:20 | Algebra | Aliyev A.A | 203 | 1-hafta

Majburiy: vaqt va fan
Ixtiyoriy: o‘qituvchi, xona, izoh`,
    { reply_markup: adminMenu() },
  );
});

// =====================
// ADMIN: DELETE LESSON
// =====================
bot.action(/^adm_delles:dir:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx, ADMIN_IDS)) return;

  const dirId = Number(ctx.match[1]);
  setState(ctx.from.id, { step: 'del_lesson_course', payload: { dirId } });

  return safeEditMessageText(ctx, 'Kursni tanlang:', {
    reply_markup: promptCourses('adm_delles', dirId),
  });
});

bot.action(/^adm_delles:course:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx, ADMIN_IDS)) return;

  const dirId = Number(ctx.match[1]);
  const course = Number(ctx.match[2]);

  setState(ctx.from.id, { step: 'del_lesson_group', payload: { dirId, course } });

  return safeEditMessageText(ctx, 'Guruhni tanlang:', {
    reply_markup: promptGroups(db, 'adm_delles', dirId, course),
  });
});

bot.action(/^adm_delles:group:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx, ADMIN_IDS)) return;

  const groupId = Number(ctx.match[1]);
  setState(ctx.from.id, { step: 'del_lesson_weekday', payload: { groupId } });

  return safeEditMessageText(ctx, 'Qaysi kun darslarini ko‘rasiz?', {
    reply_markup: promptWeekdays('adm_delles', groupId),
  });
});

bot.action(/^adm_delles:wday:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx, ADMIN_IDS)) return;

  const groupId = Number(ctx.match[1]);
  const weekday = Number(ctx.match[2]);

  const lessons = db
    .prepare(
      'SELECT id, start_time, end_time, subject FROM lessons WHERE group_id=? AND weekday=? ORDER BY start_time',
    )
    .all(groupId, weekday);

  if (!lessons.length) {
    return safeEditMessageText(ctx, 'Bu kunda dars yo‘q.', { reply_markup: adminMenu() });
  }

  const buttons = lessons.map((l) => [
    {
      text: `🗑 ${l.start_time}-${l.end_time} ${l.subject}`,
      callback_data: `adm_delles:lesson:${l.id}`,
    },
  ]);
  buttons.push([{ text: '⬅️ Admin menu', callback_data: 'adm:back' }]);

  return safeEditMessageText(ctx, 'O‘chiriladigan darsni tanlang:', {
    reply_markup: { inline_keyboard: buttons },
  });
});

bot.action(/^adm_delles:lesson:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx, ADMIN_IDS)) return;

  const id = Number(ctx.match[1]);
  db.prepare('DELETE FROM lessons WHERE id=?').run(id);
  clearState(ctx.from.id);

  return safeEditMessageText(ctx, '🗑 Dars o‘chirildi.', { reply_markup: adminMenu() });
});

// =====================
// ADMIN: IMPORT EXCEL
// =====================
bot.command('import', async (ctx) => {
  if (!isAdmin(ctx, ADMIN_IDS)) return ctx.reply('❌ Siz admin emassiz.');

  setState(ctx.from.id, { step: 'await_excel' });

  return ctx.reply(
    "📥 Excel (.xlsx) faylni shu chatga yuboring.\n\n" +
    "Ustunlar: direction, course, group, weekday, start, end, subject, teacher, room, note",
  );
});

bot.on('document', async (ctx) => {
  if (!isAdmin(ctx, ADMIN_IDS)) return;

  // faqat /import dan keyin import qilinsin
  const st = getState(ctx.from.id);
  if (!st || st.step !== 'await_excel') {
    return ctx.reply('ℹ️ Import qilish uchun avval /import yozing.');
  }

  const doc = ctx.message.document;
  const fileName = (doc.file_name || '').toLowerCase();

  if (!fileName.endsWith('.xlsx')) {
    clearState(ctx.from.id);
    return ctx.reply('❌ Faqat .xlsx fayl yuboring.');
  }

  try {
    await ctx.reply('⏳ Excel yuklanmoqda...');

    // 1) Telegramdan faylni yuklab olish
    const link = await ctx.telegram.getFileLink(doc.file_id);
    const res = await axios.get(link.href, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(res.data);

    // 2) Excel o‘qish
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows.length) {
      clearState(ctx.from.id);
      return ctx.reply('❌ Excel bo‘sh. Jadval qatorlarini kiriting.');
    }

    // 3) Ustunlarni tekshirish
    const required = ['direction', 'course', 'group', 'weekday', 'start', 'end', 'subject'];
    for (const col of required) {
      if (!(col in rows[0])) {
        clearState(ctx.from.id);
        return ctx.reply(
          `❌ Excel format xato. "${col}" ustuni yo‘q.\nKerakli: ${required.join(', ')}`,
        );
      }
    }

    // 4) DB import (transaction)
    const tx = db.transaction((rows) => {
      const groupIdsToClear = new Set();
      let lessonsInserted = 0;

      // a) direction + group larni tayyorlab, groupIdlarni yig‘amiz
      for (const r of rows) {
        const direction = String(r.direction).trim();
        const course = Number(r.course);
        const groupName = String(r.group).trim();
        const weekday = Number(r.weekday);

        if (!direction || !groupName) continue;
        if (!(course >= 1 && course <= 10)) continue;
        if (!(weekday >= 1 && weekday <= 7)) continue;

        db.prepare('INSERT OR IGNORE INTO directions(name) VALUES(?)').run(direction);
        const dirRow = db.prepare('SELECT id FROM directions WHERE name=?').get(direction);

        db.prepare('INSERT OR IGNORE INTO groups(direction_id, course, name) VALUES(?,?,?)').run(
          dirRow.id,
          course,
          groupName,
        );

        const gRow = db
          .prepare('SELECT id FROM groups WHERE direction_id=? AND course=? AND name=?')
          .get(dirRow.id, course, groupName);

        groupIdsToClear.add(gRow.id);
      }

      // b) shu guruhlarning eski darslarini o‘chiramiz
      for (const gid of groupIdsToClear) {
        db.prepare('DELETE FROM lessons WHERE group_id=?').run(gid);
      }

      // c) yangi darslarni qo‘shamiz
      for (const r of rows) {
        const direction = String(r.direction).trim();
        const course = Number(r.course);
        const groupName = String(r.group).trim();
        const weekday = Number(r.weekday);
        const start_time = excelTimeToHHMM(r.start);
        const end_time = excelTimeToHHMM(r.end);

        const subject = String(r.subject).trim();
        const teacher = String(r.teacher || '').trim() || null;
        const room = String(r.room || '').trim() || null;
        const note = String(r.note || '').trim() || null;

        if (!direction || !groupName || !subject) continue;
        if (!(course >= 1 && course <= 10)) continue;
        if (!(weekday >= 1 && weekday <= 7)) continue;

        const dirRow = db.prepare('SELECT id FROM directions WHERE name=?').get(direction);
        const gRow = db
          .prepare('SELECT id FROM groups WHERE direction_id=? AND course=? AND name=?')
          .get(dirRow.id, course, groupName);

        db.prepare(
          `INSERT INTO lessons(group_id, weekday, start_time, end_time, subject, teacher, room, note)
           VALUES(?,?,?,?,?,?,?,?)`,
        ).run(gRow.id, weekday, start_time, end_time, subject, teacher, room, note);

        lessonsInserted++;
      }

      return { groupsUpdated: groupIdsToClear.size, lessonsInserted, rows: rows.length };
    });

    const result = tx(rows);
    clearState(ctx.from.id);

    await ctx.reply(
      `✅ Import tugadi!\n` +
      `📌 Guruhlar yangilandi: ${result.groupsUpdated}\n` +
      `📚 Darslar qo‘shildi: ${result.lessonsInserted}\n` +
      `🧾 Excel qatorlari: ${result.rows}`,
      { reply_markup: adminMenu() },
    );
  } catch (e) {
    clearState(ctx.from.id);
    console.error(e);
    ctx.reply('❌ Importda xatolik: ' + e.message);
  }
});

// =====================
// ONE TEXT HANDLER (teacher + admin steps)
// =====================
bot.on('text', async (ctx) => {
  const st = getState(ctx.from.id);
  if (!st) return;

  // 1) Teacher qidirish (hamma userlar uchun)
  // ✅ O‘qituvchi qidirish (rasmdagidek kunlar bilan)
  if (st.step === 'teacher_search') {
    const q = ctx.message.text.trim();
    if (q.length < 2) return ctx.reply("❗ Kamida 2 ta belgi yozing.");

    const rows = db.prepare(`
        SELECT l.weekday, l.start_time, l.end_time, l.subject, l.room, l.note,
               g.name AS group_name, g.course, d.name AS direction,
               l.teacher
        FROM lessons l
                 JOIN groups g ON g.id = l.group_id
                 JOIN directions d ON d.id = g.direction_id
        WHERE l.teacher IS NOT NULL
          AND lower(trim(l.teacher)) LIKE lower(trim(?))
        ORDER BY l.weekday, l.start_time
    `).all(`%${q}%`);

    clearState(ctx.from.id);

    if (!rows.length) {
      return ctx.reply(`❌ Topilmadi: "${q}"`, { reply_markup: mainMenuKb() });
    }

    let text = `👨‍🏫 O‘qituvchi: ${rows[0].teacher || q}\n🔎 Qidiruv: ${q}\n\n`;

    let currentDay = null;

    for (const r of rows) {
      // ✅ KUN Sarlavhasi
      if (currentDay !== r.weekday) {
        currentDay = r.weekday;
        const dayName = WEEKDAYS.find(w => w.id === currentDay)?.name || `Kun ${currentDay}`;
        text += `📅 ${dayName}\n`;
      }

      // ✅ ROOM xatosi bo‘lmasin: room o‘zgaruvchisini shu yerda olamiz
      const room = r.room ? ` | 🏫 ${r.room}` : '';
      const note = r.note ? `\n📝 ${r.note}` : '';

      // ✅ “jadval ko‘rinishi” (rasmdagidek satrlar)
      text += `⏰ ${r.start_time}-${r.end_time} — 📚 ${r.subject}${room}\n`;
      text += `🎓 ${r.direction} | ${r.course}-kurs | ${r.group_name}${note}\n\n`;
    }

    return ctx.reply(text.trim(), { reply_markup: mainMenuKb() });
  }

  // 2) Quyidagilar faqat admin
  if (!isAdmin(ctx, ADMIN_IDS)) return;

  // ADD GROUP NAME
  if (st.step === 'add_group_name') {
    const name = ctx.message.text.trim();
    const { dirId, course } = st.payload || {};
    if (!name) return ctx.reply('❗ Guruh nomini yozing.');

    try {
      db.prepare('INSERT INTO groups(direction_id, course, name) VALUES(?,?,?)').run(dirId, course, name);
      clearState(ctx.from.id);
      return ctx.reply(`✅ Guruh qo‘shildi: ${course}-kurs | ${name}`, { reply_markup: adminMenu() });
    } catch (e) {
      return ctx.reply(`❌ Xatolik (balki guruh bor): ${e.message}\nQayta nom yozing yoki /admin`);
    }
  }

  // ADD LESSON DETAILS
  if (st.step === 'add_lesson_details') {
    const line = ctx.message.text.trim();
    const parsed = parseLessonLine(line);
    if (!parsed.ok) {
      return ctx.reply(
        '❌ ' +
        parsed.error +
        '\n\nNamuna:\n09:00-10:20 | Algebra | Aliyev A.A | 203 | 1-hafta\nYoki /admin',
      );
    }

    const { groupId, weekday } = st.payload || {};
    db.prepare(
      `INSERT INTO lessons(group_id, weekday, start_time, end_time, subject, teacher, room, note)
       VALUES(?,?,?,?,?,?,?,?)`,
    ).run(
      groupId,
      weekday,
      parsed.start_time,
      parsed.end_time,
      parsed.subject,
      parsed.teacher,
      parsed.room,
      parsed.note,
    );

    clearState(ctx.from.id);
    return ctx.reply('✅ Dars qo‘shildi.', { reply_markup: adminMenu() });
  }
});

// =====================
// LAUNCH
// =====================
// =====================
// WEBHOOK (Railway uchun)
// =====================
const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Railway "service is up" tekshirishi uchun
app.get('/', (req, res) => res.send('✅ Bot ishlayapti'));

// Telegram webhook endpoint
app.post('/telegram', (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

app.listen(PORT, async () => {
  console.log('✅ Server port:', PORT);

  if (!process.env.WEBHOOK_URL) {
    console.log('❌ WEBHOOK_URL yo‘q. Railway Variables ga qo‘shing.');
    return;
  }

  const webhookUrl = `${process.env.WEBHOOK_URL}/telegram`;

  await bot.telegram.setWebhook(webhookUrl);
  console.log('✅ Webhook o‘rnatildi:', webhookUrl);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
console.log('✅ Bot ishga tushdi');






