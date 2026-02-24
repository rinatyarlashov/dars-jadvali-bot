const { inlineKeyboardFromButtons, WEEKDAYS } = require('./keyboards');

function isAdmin(ctx, adminIds) {
  const id = ctx.from?.id;
  return id && adminIds.includes(String(id));
}

function adminMenu() {
  const buttons = [
    [{ text: '➕ Guruh qo‘shish', callback_data: 'adm:add_group' }],
    [{ text: '🗑 Guruh o‘chirish', callback_data: 'adm:del_group' }],
    [{ text: '➕ Dars qo‘shish', callback_data: 'adm:add_lesson' }],
    [{ text: '🗑 Dars o‘chirish', callback_data: 'adm:del_lesson' }],
    [{ text: '📋 Guruhlar ro‘yxati', callback_data: 'adm:list_groups' }],
  ];
  return { inline_keyboard: buttons };
}

// Admin step state (oddiy, kichik loyiha uchun RAM-da)
const adminState = new Map(); // key: adminId, value: { step, payload }

function setState(adminId, state) {
  adminState.set(String(adminId), state);
}
function getState(adminId) {
  return adminState.get(String(adminId));
}
function clearState(adminId) {
  adminState.delete(String(adminId));
}

function promptDirections(db, prefix) {
  const dirs = db
    .prepare('SELECT id, name FROM directions ORDER BY name')
    .all();
  const buttons = dirs.map((d) => [
    { text: d.name, callback_data: `${prefix}:dir:${d.id}` },
  ]);
  return { inline_keyboard: buttons };
}

function promptCourses(prefix, dirId) {
  const buttons = [1, 2, 3, 4].map((c) => [
    { text: `${c}-kurs`, callback_data: `${prefix}:course:${dirId}:${c}` },
  ]);
  return { inline_keyboard: buttons };
}

function promptGroups(db, prefix, dirId, course) {
  const groups = db
    .prepare(
      'SELECT id, name FROM groups WHERE direction_id=? AND course=? ORDER BY name',
    )
    .all(dirId, course);

  const buttons = groups.map((g) => [
    { text: g.name, callback_data: `${prefix}:group:${g.id}` },
  ]);
  if (buttons.length === 0)
    buttons.push([{ text: '⚠️ Guruh yo‘q', callback_data: 'noop' }]);
  return { inline_keyboard: buttons };
}

function promptWeekdays(prefix, groupId) {
  const buttons = WEEKDAYS.map((w) => [
    { text: w.name, callback_data: `${prefix}:wday:${groupId}:${w.id}` },
  ]);
  return { inline_keyboard: buttons };
}

module.exports = {
  isAdmin,
  adminMenu,
  setState,
  getState,
  clearState,
  promptDirections,
  promptCourses,
  promptGroups,
  promptWeekdays,
};
