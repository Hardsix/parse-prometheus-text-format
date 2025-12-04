module.exports = {
  testEnvironment: "node",
  testMatch: ["**/*.spec.js"],
  transform: {
    "^.+\\.js$": ["babel-jest", {
      presets: [["@babel/preset-env", { targets: { node: "current" } }]]
    }]
  },
};
