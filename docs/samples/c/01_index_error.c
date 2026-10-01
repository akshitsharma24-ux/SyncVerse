// Golden path: the loop goes one step too far. names[3] is NULL, the end marker.
#include <stdio.h>
#include <string.h>

int main(void) {
    const char *names[] = {"Asha", "Ravi", "Meera", NULL};
    int letters = 0;
    for (int i = 0; i <= 3; i++) {
        letters += strlen(names[i]);
    }
    printf("%d letters\n", letters);
    return 0;
}
