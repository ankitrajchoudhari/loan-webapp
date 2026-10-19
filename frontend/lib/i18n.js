'use client';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { messages } from './messages';

const LANG_KEY = 'samiti.lang';

// messages.js keeps Hindi and English side by side ({ key: [hi, en] }) so they can't drift apart.
const resources = { hi: { translation: {} }, en: { translation: {} } };
for (const [key, [hi, en]] of Object.entries(messages)) {
  resources.hi.translation[key] = hi;
  resources.en.translation[key] = en;
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: 'hi', // PRD: Hindi is the default
    fallbackLng: 'hi',
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export function restoreLanguage() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && saved !== i18n.language && resources[saved]) i18n.changeLanguage(saved);
  } catch {}
  document.documentElement.lang = i18n.language;
}

export function setLanguage(lang) {
  i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {}
}

/** Translate an ApiError (or any error) into a friendly sentence. */
export function errorText(t, err) {
  if (!err) return '';
  if (typeof err === 'string') return i18n.exists(`err.${err}`) ? t(`err.${err}`) : t('err.generic');
  const field = err.code === 'validation' && err.details?.[0]?.message;
  if (field && i18n.exists(`err.${field}`)) return t(`err.${field}`);
  const key = `err.${err.code}`;
  const params = err.details && !Array.isArray(err.details) ? err.details : undefined;
  if (!i18n.exists(key)) return t('err.generic');
  if (err.code === 'locked') return t(key, { minutes: params?.minutes ?? 15 });
  const text = t(key, params);
  // wrong login: say how many tries are left before the 15-minute lock
  return params?.left != null ? `${text} ${t('err.triesLeft', { count: params.left, n: params.left })}` : text;
}

export default i18n;
