const webpack = require("webpack");

// add wepack-merge
module.exports = (config, context) => {
  return {
    ...config,
    node: {
      ...config.node,
      global: true,
    },
    resolve: {
      ...config.resolve,
      fallback: {
        // "stream": false,
        ...config.resolve.fallback,
        "https": require.resolve("https-browserify"),
        "buffer": require.resolve("buffer/"),
        "http": require.resolve("stream-http"),
        "stream": require.resolve("stream-browserify"),
      },
    },
    plugins: [
      ...config.plugins,
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
      }),
    ],
  }
};
