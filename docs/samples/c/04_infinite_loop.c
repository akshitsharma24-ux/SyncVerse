// Timeout: the loop never ends because count never changes
#include <stdio.h>

int main(void) {
    int count = 0;
    int total = 0;
    while (count < 10) {
        total += count;
    }
    printf("%d\n", total);
    return 0;
}
