// Unlike Python, JavaScript does not stop on 0 / 0: it quietly gives NaN
function average(nums) {
  const sum = nums.reduce((a, b) => a + b, 0);
  return sum / nums.length;
}

console.log(average([]));
