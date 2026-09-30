# Quality sample: nested loops, one-letter names, magic number, long line, eval
import os


def f(a):
    r = 0
    for i in a:
        for j in a:
            for k in a:
                for m in a:
                    r += i * j * k * m * 42
    return r


x = eval(input())
print("this line is intentionally very very very very very very very very very very very very very long", f(x))
try:
    os.system("echo hi")
except:
    pass
