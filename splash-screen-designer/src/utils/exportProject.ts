import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { SplashConfig } from '../types';
import { generateSplashTSX, generateLoadingIndicatorTSX } from './codeGenerator';
import { ensureAllFilesAccess, PUBLIC_DIRS } from './storagePermission';

const EXPORT_DIR = `${FileSystem.cacheDirectory}splash-export/`;

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(EXPORT_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(EXPORT_DIR, { intermediates: true });
  }
}

/**
 * Writes SplashScreen.tsx (and LoadingIndicator.tsx if needed) to the
 * cache directory and opens the native share sheet so the user can
 * save it, AirDrop it, send it to Files, etc.
 */
export async function exportSplashAsTSX(config: SplashConfig) {
  await ensureDir();

  const splashPath = `${EXPORT_DIR}SplashScreen.tsx`;
  await FileSystem.writeAsStringAsync(splashPath, generateSplashTSX(config), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  let indicatorPath: string | null = null;
  if (config.spinner !== 'none') {
    indicatorPath = `${EXPORT_DIR}LoadingIndicator.tsx`;
    await FileSystem.writeAsStringAsync(indicatorPath, generateLoadingIndicatorTSX(), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(splashPath, {
      mimeType: 'text/plain',
      dialogTitle: 'Exportar SplashScreen.tsx',
      UTI: 'public.plain-text',
    });
  }

  return { splashPath, indicatorPath };
}

/** Copies the generated SplashScreen.tsx source straight to the clipboard. */
export async function copySplashToClipboard(config: SplashConfig) {
  await Clipboard.setStringAsync(generateSplashTSX(config));
}

/**
 * Saves SplashScreen.tsx (and LoadingIndicator.tsx if needed) directly to
 * Documents/SplashScreenDesigner/ on the device, with no share sheet in between.
 * Requires "Acceso a todos los archivos" (MANAGE_EXTERNAL_STORAGE) on Android.
 */
export async function saveSplashToDeviceStorage(
  config: SplashConfig
): Promise<{ ok: true; folder: string } | { ok: false; reason: 'permission' | 'error' }> {
  const granted = await ensureAllFilesAccess();
  if (!granted) {
    return { ok: false, reason: 'permission' };
  }

  try {
    const dir = PUBLIC_DIRS.splashDesigner;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

    await FileSystem.writeAsStringAsync(`${dir}SplashScreen.tsx`, generateSplashTSX(config), {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (config.spinner !== 'none') {
      await FileSystem.writeAsStringAsync(`${dir}LoadingIndicator.tsx`, generateLoadingIndicatorTSX(), {
        encoding: FileSystem.EncodingType.UTF8,
      });
    }

    return { ok: true, folder: dir };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
