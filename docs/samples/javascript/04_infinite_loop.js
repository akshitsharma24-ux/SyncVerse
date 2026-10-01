// Timeout: the loop never ends because count never changes
let count = 0;
let total = 0;
while (count < 10) {
  total += count;
}
console.log(total);
