# RecursionError: no base case
def countdown(n):
    print(n)
    return countdown(n - 1)


countdown(5)
