const { withAndroidManifest } = require('expo/config-plugins');

// Android's Auto Backup (on by default since API 23) silently uploads
// app-private storage -- including the file AsyncStorage keeps the Supabase
// session in -- to the signed-in Google account, then restores it on the
// very next install that matches this package name + signing key. That
// means "delete the app and reinstall" doesn't actually sign anyone out,
// which is wrong for something holding an auth session. Disabling it here
// is the standard fix (same as most apps that store credentials/tokens).
module.exports = function withDisableAndroidBackup(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:allowBackup'] = 'false';
    }
    return config;
  });
};
