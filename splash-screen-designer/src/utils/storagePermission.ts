import { Platform, Linking, Alert } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system';

/** Common public folders on the internal storage volume. */
export const PUBLIC_DIRS = {
  downloads: 'file:///storage/emulated/0/Download/',
  documents: 'file:///storage/emulated/0/Documents/',
  splashDesigner: 'file:///storage/emulated/0/Documents/SplashScreenDesigner/',
};

/**
 * MANAGE_EXTERNAL_STORAGE has no runtime "grant" API — Android forces the
 * user through a system Settings screen. This opens that screen directly
 * scoped to this app, so the user only has to flip one switch.
 */
export async function openAllFilesAccessSettings() {
  if (Platform.OS !== 'android') return;

  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION',
      { data: `package:${Application.applicationId}` }
    );
  } catch (e) {
    // Fallback for devices/ROMs that don't support the direct-to-app intent:
    // send them to the general "All files access" list instead.
    try {
      await IntentLauncher.startActivityAsync(
        'android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION'
      );
    } catch {
      Alert.alert(
        'No se pudo abrir Ajustes',
        'Ve manualmente a Ajustes → Apps → Splash Screen Designer → Permisos → Archivos y contenido multimedia, y activa "Acceso a todos los archivos".'
      );
    }
  }
}

/**
 * There's no direct API to *query* MANAGE_EXTERNAL_STORAGE status without a
 * native module, so we infer it: try writing a throwaway file to a public
 * folder outside the app's sandbox. If it succeeds, the permission is granted.
 */
export async function hasAllFilesAccess(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
    const dir = PUBLIC_DIRS.splashDesigner;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const probePath = `${dir}.permission_probe`;
    await FileSystem.writeAsStringAsync(probePath, 'ok');
    await FileSystem.deleteAsync(probePath, { idempotent: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensures full storage access before doing a direct-to-disk save.
 * If not granted, explains why and sends the user to the settings screen.
 * Returns true only if access is already confirmed granted.
 */
export async function ensureAllFilesAccess(): Promise<boolean> {
  const granted = await hasAllFilesAccess();
  if (granted) return true;

  return new Promise((resolve) => {
    Alert.alert(
      'Permiso de almacenamiento necesario',
      'Para guardar archivos directamente en tu carpeta de Documentos, activa "Acceso a todos los archivos" para esta app.',
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Abrir Ajustes',
          onPress: async () => {
            await openAllFilesAccessSettings();
            resolve(false); // user must retry the save after granting
          },
        },
      ]
    );
  });
}
