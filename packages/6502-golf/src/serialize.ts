import { Machine } from "fluffy-6502";

export function serialize_memory(machine: Machine): Record<number, number[]> {
    const ret: Record<number, number[]> = {};
    for(let i = 0; i < 65536; i += 256) {
        let nonempty = false;
        for(let j = 0; j < 256; j++) {
            if(machine.memory[i + j]) {
                nonempty = true;
                break;
            }
        }
        if(nonempty) {
            ret[i] = machine.memory.slice(i, i + 256);
        }
    }
    return ret;
}

export function deserialize_memory(data: Record<number, number[]>): Machine {
    const memory = new Array(65536).fill(0);
    for(const i of Object.keys(data)) {
        for(let j = 0; j < 256; j++) {
            const index = ((+i) + j) | 0;
            if(index < 0 || index >= 65536) {
                throw new Error("Memory address out of range");
            }
            const value = data[+i][j] | 0;
            if(value < 0 || value >= 256) {
                throw new Error("Memory value out of range");
            }
            memory[index] = value;
        }
    }
    return new Machine(memory);
}