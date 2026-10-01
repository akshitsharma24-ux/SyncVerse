// Golden path: average of numbers. The loop goes one step too far.
public class Main {
    static double average(int[] nums) {
        int total = 0;
        for (int i = 0; i <= nums.length; i++) {
            total += nums[i];
        }
        return (double) total / nums.length;
    }

    public static void main(String[] args) {
        System.out.println(average(new int[] {3, 4, 5}));
    }
}
