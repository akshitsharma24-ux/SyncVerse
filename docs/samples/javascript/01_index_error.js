// Golden path: average of marks. The loop goes one step too far.
function average(students) {
  let total = 0;
  for (let i = 0; i <= students.length; i++) {
    total += students[i].marks;
  }
  return total / students.length;
}

console.log(average([{ marks: 3 }, { marks: 4 }, { marks: 5 }]));
