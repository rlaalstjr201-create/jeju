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

// npm hoists newer peer-dep versions of native packages to root/node_modules when
// @react-navigation (pulled in by expo-router@6) requires them. Metro then bundles two
// instances of the same native module, causing "Tried to register two views with the
// same name" / duplicate-React-instance errors at runtime.
// Pin react, react-native, and all RN community native modules to apps/mobile's versions.
const PINNED_TO_MOBILE = new Set([
  'react',
  'react-native',
  'react-native-safe-area-context',
  'react-native-screens',
]);
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const root = moduleName.split('/')[0];
  const scoped = moduleName.startsWith('@') ? moduleName.split('/').slice(0, 2).join('/') : root;
  if (PINNED_TO_MOBILE.has(root) || PINNED_TO_MOBILE.has(scoped)) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(projectRoot, 'package.json') },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
