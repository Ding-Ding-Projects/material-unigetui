'use strict'
const path = require('path')

module.exports = {
  name: 'renderer',
  // Not `electron-renderer`: this renderer runs with contextIsolation on and no
  // node integration, so it is an ordinary web target. Using the electron target
  // would let a Node built-in resolve at build time and fail at runtime.
  target: 'web',
  mode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
  devtool: 'source-map',
  entry: { renderer: path.resolve(__dirname, 'src/ui/index.tsx') },
  output: { path: __dirname, filename: 'renderer.js' },
  resolve: { extensions: ['.ts', '.tsx', '.js'] },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: { compilerOptions: { noEmit: false } },
        },
      },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
      {
        // The vendored fonts (app/static/common/fonts) are referenced from
        // app/src/ui/fonts.css via relative url(). Without this rule,
        // css-loader has no loader for the binary font files it needs to
        // resolve those url()s against, and the build fails. The generator
        // filename intentionally re-emits each font at the same static path
        // it already lives at on disk, so this is a no-op copy that exists
        // purely to make the webpack asset pipeline aware of the files.
        test: /\.(woff2?|ttf|otf)$/,
        type: 'asset/resource',
        generator: { filename: 'static/common/fonts/[name][ext]' },
      },
    ],
  },
}
