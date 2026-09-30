# Golden path: average of numbers. Try stdin: 3 4 5
def average(nums):
    total = 0
    for i in range(len(nums) + 1):
        total += nums[i]
    return total / len(nums)


nums = [int(x) for x in input().split()]
print(average(nums))
