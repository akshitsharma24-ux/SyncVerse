// Compile error: text used as a number. Try stdin: 15
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        String age = in.nextLine();
        int doubled = age * 2;
        System.out.println("Double your age is " + doubled);
    }
}
