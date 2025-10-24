const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const fs = require('fs');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const webpack = require('webpack');
const dotenv = require('dotenv');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const analyzeBundle = env.analyze === true;

  const envConfig = dotenv.config().parsed;
  
  const envKeys = Object.keys(envConfig || {}).reduce((prev, next) => {
    prev[`process.env.${next}`] = JSON.stringify(envConfig[next]);
    return prev;
  }, {});
  
  // Provide fallback for process
  envKeys['process.env'] = JSON.stringify(envConfig || {});

  // Read version from package.json
  const packageJson = require('./package.json');
  const version = packageJson.version;

  return {
    entry: './src/index.js',
    resolve: {
      extensions: ['.js', '.jsx'],
      fallback: {
        "process": require.resolve("process/browser"),
      },
    },
    optimization: {
      usedExports: true,
      sideEffects: true,
      splitChunks: {
        chunks: 'all',
        maxInitialRequests: Infinity,
        minSize: 20000,
        cacheGroups: {
          react: {
            test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
            name: 'react',
            chunks: 'all',
            priority: 20,
            filename: '_js/[name].[contenthash].js',
          },
          // Specific vendor chunks for major libraries
          viem: {
            test: /[\\/]node_modules[\\/]viem[\\/]/,
            name: 'vnd.viem',
            chunks: 'all',
            priority: 15,
            filename: '_js/[name].[contenthash].js',
          },
          wagmi: {
            test: /[\\/]node_modules[\\/]wagmi[\\/]/,
            name: 'vnd.wagmi',
            chunks: 'all',
            priority: 15,
            filename: '_js/[name].[contenthash].js',
          },
          tanstack: {
            test: /[\\/]node_modules[\\/]@tanstack[\\/]/,
            name: 'vnd.tanstack',
            chunks: 'all',
            priority: 15,
            filename: '_js/[name].[contenthash].js',
          },
          easymde: {
            test: /[\\/]node_modules[\\/]easymde[\\/]/,
            name: 'vnd.easymde',
            chunks: 'all',
            priority: 15,
            filename: '_js/[name].[contenthash].js',
          },
          fontawesome: {
            test: /[\\/]node_modules[\\/]font-awesome[\\/]/,
            name: 'vnd.fontawesome',
            chunks: 'all',
            priority: 15,
            filename: '_js/[name].[contenthash].js',
          },
          reactrouter: {
            test: /[\\/]node_modules[\\/]react-router-dom[\\/]/,
            name: 'vnd.reactrouter',
            chunks: 'all',
            priority: 15,
            filename: '_js/[name].[contenthash].js',
          },
          // General vendor chunk for other node_modules
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            priority: -10,
            reuseExistingChunk: true,
            name(module) {
              // Get the package name
              const match = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/);
              if (!match) return false;
              
              const packageName = match[1];
              // Skip pnpm internal files and already handled packages
              if (packageName.startsWith('.pnpm') || 
                  packageName === 'react' || 
                  packageName === 'react-dom' ||
                  packageName === 'viem' ||
                  packageName === 'wagmi' ||
                  packageName === '@tanstack/react-query' ||
                  packageName === 'easymde' ||
                  packageName === 'font-awesome' ||
                  packageName === 'react-router-dom') {
                return false; // Let these be handled by other cache groups or main bundle
              }
              // npm package names are URL-safe, but some servers don't like @ symbols
              return `vnd.${packageName.replace('@', '')}`;
            },
            filename: '_js/[name].[contenthash].js',
          },
        },
      },
      minimize: isProduction,
      minimizer: [
        '...', // Keep existing minimizers
        ...(isProduction ? [new CssMinimizerPlugin()] : []),
      ],
    },
    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-env', {
                  modules: false // This is important for tree shaking
                }],
                '@babel/preset-react'
              ]
            }
          }
        },
        {
          test: /\.css$/,
          use: [
            MiniCssExtractPlugin.loader,
            { loader: 'css-loader', options: { importLoaders: 1 } },
            'postcss-loader',
          ],
        },
        {
          test: /\.svg$/,
          oneOf: [
            {
              // Exclude Font Awesome SVGs from SVGR processing
              exclude: /node_modules\/font-awesome/,
              use: ['@svgr/webpack'],
            },
            {
              // Handle Font Awesome SVGs as assets
              type: 'asset/resource',
              generator: {
                filename: (_pathData) => {
                  return '_assets/svg/[hash][ext]';
                }
              }
            },
          ],
        },
        {
          test: /\.(png|jpg|jpeg|gif|ico)$/,
          type: 'asset/resource',
          generator: {
            filename: (_pathData) => {
              return '_assets/images/[hash][ext]';
            }
          }
        },
        {
          test: /\.(woff|woff2|eot|ttf)$/,
          type: 'asset/resource',
          generator: {
            filename: (_pathData) => {
              return '_assets/fonts/[hash][ext]';
            }
          }
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: 'public/index.html',
        templateParameters: {
          version: version
        },
        inject: false // Disable automatic injection since we're handling it manually
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: 'public/index.md', to: 'index.md' },
          { from: 'public/_redirects', to: '.' },
          { from: 'public/images', to: '_assets/images' },
          // Copy manifest.json or manifest.webmanifest if present
          { from: 'public/manifest.json', to: 'manifest.json', noErrorOnMissing: true },
          { from: 'public/manifest.webmanifest', to: 'manifest.webmanifest', noErrorOnMissing: true },
          // Copy PrismJS CSS file
          { from: 'public/styles/prism.css', to: '_css/prism.css' },
          { from: 'public/styles/content.css', to: '_css/content.css' },
          // Copy static CSS files
          { from: 'public/theme.css', to: 'theme.css' },
        ],
      }),
      new MiniCssExtractPlugin({
        filename: '_css/[name].[contenthash].css',
      }),
      isProduction && {
        apply: (compiler) => {
          compiler.hooks.afterEmit.tap('CreateCopyPlugin', (compilation) => {
            const outputPath = compilation.outputOptions.path;
            const sourcePath = path.join(outputPath, 'index.html');
            const copyPath = path.join(outputPath, '_template.html');

            try {
              fs.copyFileSync(sourcePath, copyPath);
              console.log('Copy created: _template.html from index.html');
            } catch (error) {
              console.error('Error creating copy:', error);
            }
          });
        },
      },
      analyzeBundle && new BundleAnalyzerPlugin({
        analyzerMode: 'static',
        reportFilename: 'bundle-report.html',
        openAnalyzer: true,
        generateStatsFile: true,
        statsFilename: 'bundle-stats.json',
      }),
      new webpack.DefinePlugin(envKeys),
    ].filter(Boolean),
    devtool: 'source-map',
    output: {
      filename: '_js/[name].[contenthash].js',
      path: path.resolve(__dirname, 'dist'),
      publicPath: isProduction ? '/' : '/',
      clean: true,
    },
    devServer: {
      // https: {
      //   key: fs.readFileSync(path.join(__dirname, 'certs', 'key.pem')),
      //   cert: fs.readFileSync(path.join(__dirname, 'certs', 'cert.pem')),
      // },
      historyApiFallback: true,
      hot: true,
      port: 8080,
    },
  };
};
