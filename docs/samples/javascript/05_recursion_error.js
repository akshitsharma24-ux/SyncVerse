// RangeError: no base case
function countdown(n) {
  console.log(n);
  return countdown(n - 1);
}

countdown(5);
