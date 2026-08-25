const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Adds full filesystem access permissions to AndroidManifest.xml:
 * - MANAGE_EXTERNAL_STORAGE (special permission, must be granted via Settings)
 * - READ/WRITE_EXTERNAL_STORAGE (legacy, kept for pre-Android 11 devices)
 * - requestLegacyExternalStorage on <application>, as a fallback for older APIs
 *
 * NOTE: MANAGE_EXTERNAL_STORAGE cannot be granted through a normal runtime
 * permission dialog. The user must be redirected to a system Settings screen
 * (see src/utils/storagePermission.ts) to toggle "Allow access to manage all files".
 * Google Play requires a written justification to publish apps using this permission.
 */
function ensurePermission(androidManifest, permissionName) {
  const manifest = androidManifest.manifest;
  if (!manifest['uses-permission']) {
    manifest['uses-permission'] = [];
  }
  const alreadyExists = manifest['uses-permission'].some(
    (p) => p.$ && p.$['android:name'] === permissionName
  );
  if (!alreadyExists) {
    manifest['uses-permission'].push({ $: { 'android:name': permissionName } });
  }
}

const withManageExternalStorage = (config) => {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;

    ensurePermission(androidManifest, 'android.permission.MANAGE_EXTERNAL_STORAGE');
    ensurePermission(androidManifest, 'android.permission.READ_EXTERNAL_STORAGE');
    ensurePermission(androidManifest, 'android.permission.WRITE_EXTERNAL_STORAGE');

    const application = androidManifest.manifest.application?.[0];
    if (application) {
      application.$['android:requestLegacyExternalStorage'] = 'true';
    }

    return config;
  });
};

module.exports = withManageExternalStorage;
