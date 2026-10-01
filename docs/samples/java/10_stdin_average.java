// Average of the numbers on stdin. Try stdin: 3 4 5
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int sum = 0;
        int count = 0;
        while (in.hasNextInt()) {
            sum += in.nextInt();
            count++;
        }
        System.out.println((double) sum / count);
    }
}
