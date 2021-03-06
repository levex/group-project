var path = require('path');

module.exports = {
  entry: {
  	app: path.resolve(__dirname, 'src/components/entry.jsx')
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    publicPath: '/'
  },
  module: {
    loaders: [
      { test: /\.jsx?$/, exclude: /node_modules/, loader: "babel-loader", query: { presets: ['es2015', 'react'] } }
    ]
  },
  resolve: {
    extensions: ['.js', '.json', '.jsx']
  },
  devtool: '#eval-source-map'
};
