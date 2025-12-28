import workerpool from "workerpool";
import Machine from "./machine.ts";

export type WorkerOutput = {
    memory: number[],
    initial_bytes: number,
    cycles: number,
};

function worker(memory: Record<number, number[]>): WorkerOutput {
    const machine = Machine.deserialize(memory);
    const initial_bytes = machine.nz_bytes();
    machine.track_accesses = false;
    const start_time = performance.now();
    machine.run_until_jam(1 << 30);
    const total_time = performance.now() - start_time;
    const cycles = machine.cycles;
    console.log(cycles, "cycles", total_time, "ms", total_time * 1e6 / cycles, "ns/cycle");
    return {memory: machine.memory, initial_bytes, cycles: machine.cycles};
}

workerpool.worker({worker});