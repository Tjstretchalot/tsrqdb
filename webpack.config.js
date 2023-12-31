import CopyPlugin from 'copy-webpack-plugin';
import path from 'path';
import nodeExternals from 'webpack-node-externals';

export default {
  mode: 'production',
  target: 'node',
  externalsPresets: { node: true },
  externals: [
    nodeExternals({
      importType: 'module',
    }),
  ],
  entry: './src/index.ts',
  output: {
    path: path.resolve('dist/'),
    filename: 'rqdb.js',
    chunkFormat: 'module',
    library: {
      type: 'module',
    },
  },
  experiments: {
    outputModule: true,
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins: [
    new CopyPlugin({
      patterns: [{ from: 'dist/index.d.ts', to: 'rqdb.d.ts' }],
    }),
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.json',
              allowTsInNodeModules: true,
            },
          },
        ],
      },
    ],
  },
};
