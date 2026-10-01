// Compile error: a misspelled variable
#include <stdio.h>

int main(void) {
    int total = 0;
    int nums[] = {1, 2, 3};
    for (int i = 0; i < 3; i++) {
        total += nums[i];
    }
    printf("%d\n", totl);
    return 0;
}
