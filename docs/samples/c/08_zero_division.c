// Floating point exception: average of nothing divides by zero
#include <stdio.h>

int average(const int *nums, int count) {
    int sum = 0;
    for (int i = 0; i < count; i++) {
        sum += nums[i];
    }
    return sum / count;
}

int main(void) {
    printf("%d\n", average(NULL, 0));
    return 0;
}
