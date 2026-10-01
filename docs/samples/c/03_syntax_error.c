// Compile error: a missing semicolon
#include <stdio.h>

void greet(const char *name) {
    printf("Hello, %s\n", name)
}

int main(void) {
    greet("Asha");
    return 0;
}
