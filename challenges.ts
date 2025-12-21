export type Challenge = {
    description: string,
    output: () => number[],
};

export const EulerConstant: Challenge = {
    description: "Calculate the first 1001 digits of Euler's constant.",
    output: () => {
        let output = "2.";
        const buffer = new Array(500).fill(1);
        buffer[0] = buffer[1] = 0;
        for(let i = 0; i < 1000; i++) {
            let carry = 0;
            for(let j = buffer.length - 1; j > 0; j--) {
                const product = buffer[j] * 10 + carry;
                const quotient = Math.floor(product / j);
                const remainder = product % j;
                buffer[j] = remainder;
                carry = quotient;
            }
            output += carry;
        }
        const chars = [];
        for(let i = 0; i < output.length; i++) {
            chars.push(output.charCodeAt(i));
        }
        chars.push(0);
        return chars;
    }
};

export const ThueMorse: Challenge = {
    description: "Calculate the first 1024 entries in the Thue-Morse sequence.",
    output: () => {
        const output = [0x30, 0x31];
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
    description: "Print the integers from 1 to 1000 inclusive, separated with newlines.",
    output: () => {
        const output = [];
        for(let i = 1; i <= 1000; i++) {
            const value = i.toString();
            for(const j of value) {
                output.push(j.charCodeAt(0));
            }
            if(i < 1000) {
                output.push(0x0a);
            }
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