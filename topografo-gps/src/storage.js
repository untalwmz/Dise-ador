import AsyncStorage from '@react-native-async-storage/async-storage';

const LOTS_KEY = 'topografo.lots.v1';
const DRAFT_KEY = 'topografo.draft.v1';
const SETTINGS_KEY = 'topografo.settings.v1';

export const DEFAULT_SETTINGS = {
  mode: 'auto', // 'auto' = registra al caminar, 'manual' = marcar vértices
  interval: 2, // metros entre puntos en modo caminata
  maxAccuracy: 10, // descarta lecturas peores que esto (m)
  averageSamples: 10, // lecturas a promediar al marcar un vértice
  source: 'phone', // 'phone' | 'external' (receptor Bluetooth)
  externalDevice: null, // { name, address }
};

async function readJSON(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export async function listLots() {
  const lots = await readJSON(LOTS_KEY, []);
  return lots.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getLot(id) {
  const lots = await readJSON(LOTS_KEY, []);
  return lots.find((l) => l.id === id) || null;
}

export async function saveLot(lot) {
  const lots = await readJSON(LOTS_KEY, []);
  const i = lots.findIndex((l) => l.id === lot.id);
  if (i >= 0) lots[i] = lot;
  else lots.push(lot);
  await AsyncStorage.setItem(LOTS_KEY, JSON.stringify(lots));
  return lot;
}

export async function deleteLot(id) {
  const lots = await readJSON(LOTS_KEY, []);
  await AsyncStorage.setItem(LOTS_KEY, JSON.stringify(lots.filter((l) => l.id !== id)));
}

// Borrador del levantamiento en curso, para no perderlo si se cierra la app.
export async function saveDraft(draft) {
  try {
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // sin espacio o error de E/S: no es crítico
  }
}

export const getDraft = () => readJSON(DRAFT_KEY, null);
export const clearDraft = () => AsyncStorage.removeItem(DRAFT_KEY);

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await readJSON(SETTINGS_KEY, {})) };
}

export async function saveSettings(s) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
