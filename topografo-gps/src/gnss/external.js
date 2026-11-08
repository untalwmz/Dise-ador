// Gestor de la conexión con el receptor GNSS externo. Es un singleton para que
// la conexión se mantenga al cambiar de pantalla.
import { PermissionsAndroid, Platform } from 'react-native';
import BluetoothGnss from '../../modules/bluetooth-gnss';
import { createNmeaAssembler } from './nmea';

const MAX_RECONNECTS = 5;

const state = {
  status: 'disconnected', // disconnected | connecting | connected | reconnecting
  device: null, // { name, address }
  lastFix: null,
  lastGga: null,
  message: null,
  epochs: 0,
};

const listeners = new Set();
const fixListeners = new Set();
let subs = [];
let reconnects = 0;
let reconnectTimer = null;
let wantConnected = false;

const notify = () => listeners.forEach((l) => l({ ...state }));
const set = (patch) => {
  Object.assign(state, patch);
  notify();
};

const assembler = createNmeaAssembler((fix, gga) => {
  state.lastGga = gga;
  state.lastFix = fix;
  state.epochs += 1;
  fixListeners.forEach((l) => l(fix, gga));
  notify();
});

export const isAvailable = () => Platform.OS === 'android' && BluetoothGnss != null;

export function getState() {
  return { ...state };
}

export function subscribe(listener) {
  listeners.add(listener);
  listener({ ...state });
  return () => listeners.delete(listener);
}

/** Recibe cada época del receptor: fix (o null si no hay solución) y la GGA cruda. */
export function onFix(listener) {
  fixListeners.add(listener);
  return () => fixListeners.delete(listener);
}

function attachNativeListeners() {
  if (subs.length || !BluetoothGnss) return;
  subs = [
    BluetoothGnss.addListener('onNmea', (e) => assembler(e.line)),
    BluetoothGnss.addListener('onStatus', (e) => {
      if (e.state === 'disconnected' && wantConnected) scheduleReconnect(e.message);
      else if (e.state === 'disconnected') set({ status: 'disconnected', message: e.message || null });
    }),
  ];
}

export async function requestPermissions() {
  if (Platform.OS !== 'android') return false;
  if (Platform.Version < 31) return true;
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT, {
    title: 'Permiso de Bluetooth',
    message: 'Se necesita para conectarse a tu receptor GPS externo.',
    buttonPositive: 'Permitir',
    buttonNegative: 'Cancelar',
  });
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

export async function getPairedDevices() {
  if (!isAvailable()) return [];
  if (!(await requestPermissions())) throw new Error('Permiso de Bluetooth denegado');
  if (!BluetoothGnss.isEnabled()) throw new Error('El Bluetooth está apagado. Actívalo e inténtalo de nuevo.');
  const list = await BluetoothGnss.getBondedDevices();
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

async function doConnect(device) {
  attachNativeListeners();
  await BluetoothGnss.connect(device.address);
  reconnects = 0;
  set({ status: 'connected', device, message: null });
}

export async function connect(device) {
  if (!isAvailable()) throw new Error('Solo disponible en la app instalada (APK) en Android.');
  if (!(await requestPermissions())) throw new Error('Permiso de Bluetooth denegado');
  clearTimeout(reconnectTimer);
  wantConnected = true;
  set({ status: 'connecting', device, message: null, lastFix: null, lastGga: null, epochs: 0 });
  try {
    await doConnect(device);
  } catch (e) {
    wantConnected = false;
    set({ status: 'disconnected', message: e.message });
    throw e;
  }
}

function scheduleReconnect(reason) {
  if (reconnects >= MAX_RECONNECTS) {
    wantConnected = false;
    set({ status: 'disconnected', message: `Conexión perdida: ${reason || ''}`.trim() });
    return;
  }
  reconnects += 1;
  set({ status: 'reconnecting', message: `Reconectando (${reconnects}/${MAX_RECONNECTS})…`, lastFix: null });
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(async () => {
    if (!wantConnected || !state.device) return;
    try {
      await doConnect(state.device);
    } catch (e) {
      scheduleReconnect(e.message);
    }
  }, 2000 * reconnects);
}

export async function disconnect() {
  wantConnected = false;
  clearTimeout(reconnectTimer);
  if (BluetoothGnss) {
    try {
      await BluetoothGnss.disconnect();
    } catch {
      // ya estaba desconectado
    }
  }
  set({ status: 'disconnected', message: null, lastFix: null, lastGga: null });
}

/** Conecta al receptor guardado si no hay conexión (al entrar a medir). */
export async function ensureConnected(device) {
  if (!device || !isAvailable()) return;
  if (state.status !== 'disconnected' && state.device?.address === device.address) return;
  try {
    await connect(device);
  } catch {
    // el estado ya refleja el error
  }
}
