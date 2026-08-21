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
    ],
  },
}
