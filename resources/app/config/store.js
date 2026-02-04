const Store = require('electron-store').default || require('electron-store');

function createStore() {
  return new Store();
}

module.exports = {
  createStore
};

