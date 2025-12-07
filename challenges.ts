export type Challenge = {
    description: string,
    output: () => number[],
};

export const EulerConstant: Challenge = {
    description: "Calculate the first 1001 digits Euler's constant. Output is read starting from address 0x8000, and ends at a null byte.",
    output: () => {
        let output = "2.";
        let buffer = new Array(500).fill(1);
        buffer[0] = buffer[1] = 0;
        for(let i = 0; i < 1000; i++) {
            let carry = 0;
            for(let j = buffer.length - 1; j > 0; j--) {
                let product = buffer[j] * 10 + carry;
                let quotient = Math.floor(product / j);
                let remainder = product % j;
                buffer[j] = remainder;
                carry = quotient;
            }
            output += carry;
        }
        let chars = [];
        for(let i = 0; i < output.length; i++) {
            chars.push(output.charCodeAt(i));
        }
        chars.push(0);
        return chars;
    }
};

export const ThueMorse: Challenge = {
    description: "Calculate the first 1024 entries in the Thue-Morse sequence. Output is read starting from address 0x8000, and ends at a null byte.",
    output: () => {
        let output = [0x30, 0x31];
        for(let i = 1; i < 512; i++) {
            if(output[i] == 0x30) {
                output.push(0x30, 0x31);
            } else {
                output.push(0x31, 0x30);
            }
        }
        output.push(0x00);
        return output;
    }
};

export const CountTo1000: Challenge = {
    description: "Print the integers from 1 to 1000 inclusive, separated with newlines. Output is read starting from address 0x8000, and ends at a null byte.",
    output: () => {
        let output = [];
        for(let i = 1; i <= 1000; i++) {
            let value = i.toString();
            for(let j of value) {
                output.push(j.charCodeAt(0));
            }
            output.push(0x0a);
        }
        output.push(0x00);
        return output;
    }
};

const challenges = new Map([
    ["Count to 1000", CountTo1000],
    ["Euler's Constant", EulerConstant],
    ["Thue-Morse Sequence", ThueMorse],
]);

export default challenges;