const math = {
    commonFactors: (numbers) => {
        let g = numbers[0];

        // Set to store all the 
        // common divisors 
        let divisors = [];

        // Finding GCD of the given 
        // N numbers 
        for (let i = 1; i < numbers.length; i++) {
            g = gcd(numbers[i], g);
        }

        // Finding divisors of the 
        // HCF of n numbers 
        for (let i = 1; i * i <= g; i++) {
            if (g % i === 0) {
                divisors.push(i);
                if (g / i !== i)
                    divisors.push(g / i);
            }
        }

        return divisors;
    },
    makeEven: (num) => {
        if (!(Math.abs(num) % 2)) return num;
        return num - 1;
    }
}

const gcd = (a, b) => {
    if (a == 0)
        return b;
    return gcd(b % a, a);
}

module.exports = math;