module.exports = {
    "extends": [
        "eslint:recommended"
    ],
    "parserOptions": {
        "ecmaVersion": 9,
        "sourceType": "module",
    },
    "env": {
        "es6": true,
        "mocha": true,
        "node": true,
        "commonjs": true
    },
    "rules": {
        "no-console": "off"
    }
};