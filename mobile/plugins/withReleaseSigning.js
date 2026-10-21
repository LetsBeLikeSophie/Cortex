const { withAppBuildGradle } = require('expo/config-plugins');

// Release builds (the Play Store AAB and the self-hosted APK) sign with the
// upload key instead of the debug keystore the template ships with. The key
// itself never enters the repo: its path and passwords come from Gradle
// properties in the user-level ~/.gradle/gradle.properties
//   CORTEX_UPLOAD_STORE_FILE, CORTEX_UPLOAD_STORE_PASSWORD,
//   CORTEX_UPLOAD_KEY_ALIAS, CORTEX_UPLOAD_KEY_PASSWORD
// Without them (another machine, CI) release falls back to debug signing,
// which Play rejects -- so a missing key is loud, not silent.
// Done as a config plugin because android/ is generated (expo prebuild)
// and a hand edit to build.gradle would be wiped on the next prebuild.
module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let gradle = config.modResults.contents;
    if (gradle.includes('CORTEX_UPLOAD_STORE_FILE')) return config;

    gradle = gradle.replace(
      /signingConfigs \{\n(\s+)debug \{/,
      (match, indent) =>
        `signingConfigs {\n${indent}release {\n` +
        `${indent}    if (project.hasProperty('CORTEX_UPLOAD_STORE_FILE')) {\n` +
        `${indent}        storeFile file(CORTEX_UPLOAD_STORE_FILE)\n` +
        `${indent}        storePassword CORTEX_UPLOAD_STORE_PASSWORD\n` +
        `${indent}        keyAlias CORTEX_UPLOAD_KEY_ALIAS\n` +
        `${indent}        keyPassword CORTEX_UPLOAD_KEY_PASSWORD\n` +
        `${indent}    }\n` +
        `${indent}}\n${indent}debug {`
    );
    gradle = gradle.replace(
      /(release \{\n(?:\s+\/\/.*\n)*\s+)signingConfig signingConfigs\.debug/,
      `$1signingConfig project.hasProperty('CORTEX_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug`
    );
    if (!gradle.includes("signingConfigs.release : signingConfigs.debug")) {
      throw new Error('withReleaseSigning: build.gradle layout changed, release signing not applied');
    }
    config.modResults.contents = gradle;
    return config;
  });
};
