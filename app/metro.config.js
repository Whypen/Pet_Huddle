const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const defaultEnhanceMiddleware = config.server?.enhanceMiddleware;

const normalizeEncodedRelativeAssetPath = (url) => {
  if (!url || !url.startsWith("/assets/.%2F")) return url;
  return url.replace(/^\/assets\/\.%2F/i, "/assets/").replace(/%2F/gi, "/");
};

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, server) => {
    const upstream = defaultEnhanceMiddleware
      ? defaultEnhanceMiddleware(middleware, server)
      : middleware;

    return (req, res, next) => {
      req.url = normalizeEncodedRelativeAssetPath(req.url);
      return upstream(req, res, next);
    };
  },
};

module.exports = config;
