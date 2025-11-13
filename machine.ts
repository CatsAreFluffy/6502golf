export class MemoryRange {
    start: number;
    end: number;

    constructor(start: number, end: number) {
        this.start = start;
        this.end = end;
    }

    includes(value: number): boolean {
        return +(value >= this.start) + +(value < this.end) + +(this.start > this.end) >= 2;
    }

    overlaps(other: MemoryRange): boolean {
        if(this.start == this.end || other.start == other.end) {
            return false;
        }
        return this.includes(other.start) || other.includes(this.start);
    }
}

export default class Machine {
    memory: number[];

    pc: number;
    a: number = 0;
    x: number = 0;
    y: number = 0;
    s: number = 0xff;

    n: boolean = false;
    z: boolean = false;
    c: boolean = false;
    v: boolean = false;
    d: boolean = false;
    i: boolean = false;

    cycles: number = 0;

    last_instruction: MemoryRange = new MemoryRange(0, 0);
    last_data: MemoryRange = new MemoryRange(0, 0);

    constructor(memory: number[]) {
        this.memory = memory;

        this.pc = (memory[0xfffd] << 8) | memory[0xfffc];
    }

    clone(): Machine {
        let ret = new Machine(this.memory.slice());
        
        ret.pc = this.pc;
        ret.a = this.a;
        ret.x = this.x;
        ret.y = this.y;
        ret.s = this.s;
        
        ret.n = this.n;
        ret.z = this.z;
        ret.c = this.c;
        ret.v = this.v;
        ret.d = this.d;
        ret.i = this.i;

        ret.cycles = this.cycles;

        return ret;
    }

    read(address: number): number {
        this.cycles++;
        return this.memory[address];
    }

    read_instruction(): number {
        let ret = this.read(this.pc);
        this.pc = (this.pc + 1) & 0xffff;
        return ret;
    }

    write(address: number, value: number) {
        this.memory[address] = value;
        this.cycles++;
    }
    
    set_nz(value: number) {
        this.z = value == 0;
        this.n = value >= 128;
    }

    step() {
        let instruction_start = this.pc;
        const opcodes = new Map([
            [0x8d, ["sta", "absolute"]],
            [0xa9, ["lda", "immediate"]],
            [0xad, ["lda", "absolute"]],
        ]);
        let opcode = this.read_instruction();
        let decode = opcodes.get(opcode);
        if(!decode) {
            throw new Error(`Unknown opcode ${opcode}`);
        }
        let [instruction, mode] = decode;
        let effective_address = 0;
        switch(mode) {
            case "absolute": {
                let low = this.read_instruction();
                let high = this.read_instruction();
                effective_address = (high << 8) | low;
                break;
            }
            case "immediate": 
                effective_address = this.pc;
                this.pc++;
                break;
            default:
                throw new Error(`Unknown addressing mode ${mode}`);
        }
        if(mode == "immediate") {
            this.last_data = new MemoryRange(0, 0);
        } else {
            this.last_data = new MemoryRange(effective_address, (effective_address + 1) & 0xffff);
        }
        switch(instruction) {
            case "lda":
                this.a = this.read(effective_address);
                this.set_nz(this.a);
                break;
            case "sta":
                this.write(effective_address, this.a);
                break;
            default:
                throw new Error(`Unknown instruction ${instruction}`);
        }
        let instruction_end = this.pc;
        this.last_instruction = new MemoryRange(instruction_start, instruction_end);
    }
}