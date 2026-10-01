// ArithmeticException: average of an empty array
public class Main {
    static int average(int[] nums) {
        int sum = 0;
        for (int n : nums) {
            sum += n;
        }
        return sum / nums.length;
    }

    public static void main(String[] args) {
        System.out.println(average(new int[] {}));
    }
}
