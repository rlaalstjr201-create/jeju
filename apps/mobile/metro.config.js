const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// expo-router@6 → @react-navigation/bottom-tabs@7.x has peerDep react-native@0.85.3,
// so npm hoists 0.85.3 to root/node_modules alongside apps/mobile's SDK 54 install (0.81.5).
// Metro may resolve react-native imports from packages in root to the wrong 0.85.3 version
// (which has VirtualViewNativeComponent codegen that babel-plugin-codegen@0.81.5 can't parse).
// Use resolveRequest to pin ALL react-native requires to apps/mobile's 0.81.5.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native' || moduleName.startsWith('react-native/')) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(projectRoot, 'package.json') },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
