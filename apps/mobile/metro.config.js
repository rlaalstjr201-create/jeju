const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow @jeju/* workspace packages (TypeScript source) to be transpiled.
// SDK 52+ handles watchFolders / symlink resolution automatically.
// transformIgnorePatterns still needs explicit opt-in for workspace TS source.
const { transformer } = config;
config.transformer = {
  ...transformer,
  transformIgnorePatterns: [
    'node_modules/(?!(@jeju|expo(nent)?|@expo(nent)?/.*|@react-native(?!/windows)|@react-native-community|expo-router|react-clone-referenced-element)/)',
  ],
};

module.exports = config;
