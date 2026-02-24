const WEEKDAYS = [
  { id: 1, name: 'Dushanba' },
  { id: 2, name: 'Seshanba' },
  { id: 3, name: 'Chorshanba' },
  { id: 4, name: 'Payshanba' },
  { id: 5, name: 'Juma' },
  { id: 6, name: 'Shanba' },
  { id: 7, name: 'Yakshanba' },
];

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function inlineKeyboardFromButtons(buttons, perRow = 2) {
  return { inline_keyboard: chunk(buttons, perRow) };
}

module.exports = { WEEKDAYS, inlineKeyboardFromButtons };
