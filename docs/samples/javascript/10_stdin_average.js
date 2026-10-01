// Average of the numbers on stdin. Try stdin: 3 4 5
const nums = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
const sum = nums.reduce((a, b) => a + b, 0);
console.log((sum / nums.length).toFixed(1));
