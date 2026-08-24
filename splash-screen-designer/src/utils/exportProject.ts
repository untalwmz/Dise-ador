import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { SplashConfig } from '../types';
import { generateSplashTSX, generateLoadingIndicatorTSX } from './codeGenerator';

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
