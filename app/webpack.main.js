'use strict'
const path = require('path')

const common = {
  mode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
  devtool: 'source-map',
  resolve: { extensions: ['.ts', '.tsx', '.js'] },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: { transpileOnly: false, compilerOptions: { noEmit: false } },
        },
      },
    ],
  },
}

module.exports = [
  {
    ...common,
    name: 'main',
    target: 'electron-main',
    entry: { main: path.resolve(__dirname, 'src/main-process/main.ts') },
    output: { path: __dirname, filename: 'main.js' },
  },
  {
    ...common,
    name: 'preload',
    target: 'electron-preload',
    entry: { preload: path.resolve(__dirname, 'src/preload.ts') },
    output: { path: __dirname, filename: 'preload.js' },
  },
]
