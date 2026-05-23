module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // babel-preset-expo is hoisted to root node_modules; expo-router lives in
      // apps/mobile/node_modules. hasModule('expo-router') returns false from root,
      // so babel-preset-expo skips expoRouterBabelPlugin. Add it explicitly so
      // process.env.EXPO_ROUTER_APP_ROOT gets substituted at bundle time.
      require('babel-preset-expo/build/expo-router-plugin').expoRouterBabelPlugin,
    ],
  };
};
