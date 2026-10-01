// Segmentation fault: no base case, so the stack runs out
#include <stdio.h>

int countdown(int n) {
    return countdown(n - 1);
}

int main(void) {
    printf("%d\n", countdown(5));
    return 0;
}
