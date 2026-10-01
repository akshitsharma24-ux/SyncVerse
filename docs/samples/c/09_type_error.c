// Compile error: text used as a number. Try stdin: 15
#include <stdio.h>

int main(void) {
    char age[16];
    scanf("%15s", age);
    int doubled = age * 2;
    printf("Double your age is %d\n", doubled);
    return 0;
}
