// TypeError: text has no number methods until you convert it. Try stdin: 15
const age = require("fs").readFileSync(0, "utf8").trim();
console.log("Next year you will be " + (age.toFixed(0) + 1));
