// Aliasing: b = a makes two names for ONE array
const a = [1, 2, 3];
const b = a;
b.push(4);
console.log("a is", a);
console.log("b is", b);
