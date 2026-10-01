// Average of the numbers on stdin. Try stdin: 3 4 5
#include <stdio.h>

int main(void) {
    int n;
    int sum = 0;
    int count = 0;
    while (scanf("%d", &n) == 1) {
        sum += n;
        count++;
    }
    printf("%.1f\n", (double) sum / count);
    return 0;
}
