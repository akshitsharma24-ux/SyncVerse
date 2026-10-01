// Aliasing: b = a makes two names for ONE array
#include <stdio.h>

int main(void) {
    int a[3] = {1, 2, 3};
    int *b = a;
    b[0] = 99;
    printf("a[0] is %d\n", a[0]);
    printf("b[0] is %d\n", b[0]);
    return 0;
}
