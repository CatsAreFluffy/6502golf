import { Challenge } from "./challenges.ts";
import Machine from "./machine.ts";

export function judge(machine: Machine, challenge: Challenge) {
    const output = machine.memory.slice(0x8000);
    const expected_output = challenge.output();
    for(let i = 0; i < Math.min(output.length, expected_output.length); i++) {
        if(output[i] != expected_output[i]) {
            return false;
        }
    }
    return true;
}