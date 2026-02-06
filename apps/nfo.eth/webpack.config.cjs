const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (_env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    entry: './src/index.jsx',
    resolve: {
      extensions: ['.js', '.jsx'],
    },
    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env', '@babel/preset-react'],
            },
          },
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader', 'postcss-loader'],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: 'public/index.html',
        inject: 'body',
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, '../../packages/react-components/assets/icons'),
            to: '_assets/images/icons',
          },
          {
            from: 'public/favicon.svg',
            to: 'favicon.svg',
          },
          {
            from: 'public/favicon-dark.svg',
            to: 'favicon-dark.svg',
          },
        ],
      }),
    ],
    output: {
      filename: '_js/[name].[contenthash].js',
      path: path.resolve(__dirname, 'dist'),
      publicPath: '/',
      clean: true,
    },
    devtool: isProduction ? false : 'source-map',
    devServer: {
      historyApiFallback: true,
      hot: true,
      port: 8092,
    },
  };
};
